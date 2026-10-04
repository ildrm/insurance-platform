import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function demoPassword(): string {
  if (process.env.DEMO_PASSWORD) return process.env.DEMO_PASSWORD;
  return readFileSync(path.resolve(process.cwd(), '../../.local/demo-password'), 'utf8').trim();
}
async function signIn(page: Page, email = 'customer@example.test', heading = 'Find cover') {
  await page.goto('/');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: false }).fill(demoPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Clear credentials if the API rejects login before failure artifacts are captured.
  await page.evaluate(() => { const password = document.querySelector<HTMLInputElement>('input[name="password"]'); if (password) password.value = ''; });
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
}

test('the BFF rejects cross-origin cookie-authenticated writes', async ({ request, baseURL }) => {
  const response = await request.post('/api/auth/login', {
    headers: { origin: 'https://untrusted.example' },
    data: { email: 'customer@example.test', password: 'untrusted-request' },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).code).toBe('INVALID_ORIGIN');
  const otherScheme = new URL(baseURL!);
  otherScheme.protocol = otherScheme.protocol === 'http:' ? 'https:' : 'http:';
  const schemeResponse = await request.post('/api/auth/login', {
    headers: { origin: otherScheme.origin },
    data: { email: 'customer@example.test', password: 'untrusted-request' },
  });
  expect(schemeResponse.status()).toBe(403);
});

test('the BFF rejects oversized bodies before reaching the API', async ({ request, baseURL }) => {
  const response = await request.post('/api/claims/oversized/documents', {
    headers: { origin: new URL(baseURL!).origin, 'content-type': 'application/octet-stream' },
    data: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  expect(response.status()).toBe(413);
  expect((await response.json()).code).toBe('PAYLOAD_TOO_LARGE');
});

test('a customer completes the sandbox quote, policy and evidence journey', async ({ page, context }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await signIn(page);
  const productsResponse = await context.request.get('/api/products');
  expect(productsResponse.ok()).toBeTruthy();
  const sandboxProducts = (await productsResponse.json() as { id: string; name: string; sandbox: boolean }[]).filter(product => product.sandbox);
  test.skip(sandboxProducts.length === 0, 'Mutating UI smoke checks require a seeded local sandbox product.');
  const product = sandboxProducts.find(product => product.name === 'Home Essentials')!;
  expect(product, 'The integrated fixture must publish the Home Essentials sandbox product.').toBeDefined();
  const card = page.locator('article.product').filter({ has: page.getByRole('heading', { name: product.name, exact: true }) }).first();
  await card.getByRole('button', { name: 'Get a quote →' }).click();
  const quoteForm = page.locator('section.form-panel').filter({ has: page.getByRole('heading', { name: 'Quote for ' + product.name, exact: true }) });
  await quoteForm.getByLabel('Applicant age').fill('35');
  await quoteForm.getByLabel('Asset value').fill('250000.00');
  const createdQuoteResponse = page.waitForResponse(response => response.url().endsWith('/api/quotes') && response.request().method() === 'POST');
  await quoteForm.getByRole('button', { name: 'Calculate my quote' }).click();
  const quoteResponse = await createdQuoteResponse;
  expect(quoteResponse.ok()).toBeTruthy();
  const quote = await quoteResponse.json() as { id: string; answers: { assetValueMinor: string } };
  expect(quote.answers.assetValueMinor).toBe('25000000');
  await expect(page.getByRole('status').filter({ hasText: 'Your quote was created.' })).toBeVisible();
  await page.getByRole('link', { name: /Your quotes/ }).click();
  const quoteRow = page.locator('tr[data-resource-id="' + quote.id + '"]');
  await quoteRow.getByRole('button', { name: 'Review purchase' }).click();
  await expect(page.getByText('Local sandbox payment and insurer adapter.', { exact: false })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Immutable coverage and contract review' })).toBeVisible();
  await page.getByLabel('I have reviewed the coverage, deductibles and contract terms.').check();
  const purchaseResponse = page.waitForResponse(response => response.url().endsWith(`/api/quotes/${quote.id}/purchase`));
  await page.getByRole('button', { name: 'Confirm purchase →' }).click();
  expect((await purchaseResponse).ok()).toBeTruthy();
  await expect(page.getByRole('link', { name: 'View policy →' })).toBeVisible({ timeout: 90_000 });
  await page.getByRole('link', { name: /Your policies/ }).click();
  await expect(page.getByRole('heading', { name: 'Your policies', exact: true })).toBeVisible();
  const operationId = (await (await purchaseResponse).json()).operationId;
  const issued = await (await context.request.get('/api/operations/' + operationId)).json() as { policyId: string };
  const policyRow = page.locator('tr[data-resource-id="' + issued.policyId + '"]');
  const downloadPromise = page.waitForEvent('download');
  await policyRow.getByRole('link', { name: 'Document ↗' }).click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename().length).toBeGreaterThan(0);
  const policyResponse = await context.request.get('/api/policies');
  const policies = await policyResponse.json() as { id: string; productName: string; effectiveAt: string }[];
  const policy = policies.find(item => item.id === issued.policyId)!;
  await page.getByRole('link', { name: /Claims & support/ }).click();
  await page.getByRole('combobox', { name: 'Policy', exact: true }).selectOption(policy.id);
  await expect.poll(() => Date.now() - new Date(policy.effectiveAt).valueOf()).toBeGreaterThanOrEqual(1000);
  // datetime-local expects the browser's local clock, including seconds. ISO slicing
  // would reinterpret UTC as local time and move the incident before coverage began.
  const incidentLocal = await page.evaluate(() => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  });
  await expect(page.getByLabel('Incident date and time')).toHaveAttribute('step', '1');
  await page.getByLabel('Incident date and time').fill(incidentLocal);
  await page.getByLabel('What happened?').fill('Sandbox smoke test: accidental water damage to the insured property.');
  await page.getByLabel('Requested amount').fill('1000.00');
  await page.getByRole('button', { name: 'Report incident' }).click();
  await expect(page.getByRole('heading', { name: 'Add supporting evidence', exact: true })).toBeVisible();
  await page.getByLabel('Document (up to 10 MB)').setInputFiles({
    name: 'sandbox-evidence.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCJ0AAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: 'Upload document' }).click();
  await expect(page.getByText('sandbox-evidence.png', { exact: false })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Document uploaded.' })).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.find(cookie => cookie.name === 'ip_session')?.httpOnly).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage))).not.toContain('ip_session');
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: '../../artifacts/customer-web/claims-workbench.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('link', { name: /Complaints/ }).click();
  await page.getByRole('combobox', { name: 'Policy', exact: true }).selectOption(policy.id);
  await page.getByRole('textbox', { name: 'Subject', exact: true }).fill('Sandbox browser service concern');
  await page.getByLabel('Describe your concern').fill('This is a sandbox browser test of the private complaint workflow and recorded history.');
  const complaintCreated = page.waitForResponse(response => response.url().endsWith('/api/complaints') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Submit complaint' }).click();
  expect((await complaintCreated).ok()).toBeTruthy();
  await expect(page.getByRole('region', { name: 'Complaint details' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recorded history' })).toBeVisible();
  await page.getByRole('button', { name: /Notifications/ }).click();
  await expect(page.getByRole('region', { name: 'Private in-app notifications' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark as read' }).first().click();
  await expect(page.getByRole('region', { name: 'Private in-app notifications' }).getByText('Read', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await page.screenshot({ path: '../../artifacts/customer-web/complaint-history.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Sign out →' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
});

test('mobile navigation and quote controls remain usable without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole('link', { name: /Your quotes/ }).click();
  await expect(page.getByRole('heading', { name: 'Your quotes', exact: true })).toBeVisible();
  await expect(page.getByLabel('Applicant age')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: '../../artifacts/customer-web/mobile-quotes.png', fullPage: true, animations: 'disabled' });
});


test('complaint resolution supports an appeal and customer acceptance across real portals', async ({ page, context, browser }) => {
  await signIn(page);
  const policiesResponse = await context.request.get('/api/policies');
  expect(policiesResponse.ok()).toBeTruthy();
  const policies = await policiesResponse.json() as { id: string }[];
  expect(policies.length, 'The earlier completed policy journey supplies a customer-owned policy.').toBeGreaterThan(0);
  await page.getByRole('link', { name: /Complaints/ }).click();
  await page.getByRole('combobox', { name: 'Policy', exact: true }).selectOption(policies[0].id);
  await page.getByRole('textbox', { name: 'Subject', exact: true }).fill('Sandbox browser appeal verification');
  await page.getByLabel('Describe your concern').fill('Verify the customer and administrator complaint service workflow in the local sandbox.');
  const created = page.waitForResponse(response => response.url().endsWith('/api/complaints') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Submit complaint' }).click();
  const createdResponse = await created;
  expect(createdResponse.ok()).toBeTruthy();
  const complaint = await createdResponse.json() as { id: string };
  const admin = await browser.newContext({ baseURL: process.env.ADMIN_WEB_ORIGIN || 'http://127.0.0.1:3102', timezoneId: 'Asia/Tehran' });
  try {
    const adminPage = await admin.newPage();
    await signIn(adminPage, 'admin@example.test', 'Overview');
    await adminPage.getByRole('link', { name: /Complaints/ }).click();
    await expect(adminPage.getByText('These are operational service targets. They do not represent statutory deadlines.')).toBeVisible();
    const openComplaint = async (target: Page) => {
      await target.getByRole('button', { name: 'Refresh ↻', exact: true }).click();
      await target.locator('tr[data-resource-id="' + complaint.id + '"]').getByRole('button', { name: 'Open complaint' }).click();
      await expect(target.getByRole('region', { name: 'Complaint details' })).toBeVisible();
    };
    const transition = async (target: Page, status: string, reason: string, resolution?: string) => {
      await target.getByRole('combobox', { name: 'Next step', exact: true }).selectOption(status);
      await target.getByRole('textbox', { name: target === adminPage ? 'Reason for this step' : 'Reason for your response', exact: true }).fill(reason);
      if (resolution) await target.getByLabel('Resolution provided to the customer').fill(resolution);
      const response = target.waitForResponse(response => response.url().endsWith('/api/complaints/' + complaint.id + '/transitions') && response.request().method() === 'POST');
      await target.getByRole('button', { name: 'Save complaint response' }).click();
      expect((await response).ok()).toBeTruthy();
      await expect(target.getByRole('region', { name: 'Complaint details' }).getByText(status, { exact: true }).first()).toBeVisible();
    };
    await openComplaint(adminPage);
    await transition(adminPage, 'ACKNOWLEDGED', 'The service team has acknowledged this sandbox concern.');
    await transition(adminPage, 'INVESTIGATING', 'The service team is reviewing the sandbox concern.');
    await transition(adminPage, 'RESOLVED', 'An initial sandbox response has been provided.', 'Initial sandbox response for customer review.');
    await openComplaint(page);
    await transition(page, 'ESCALATED', 'Please review the initial sandbox response again.');
    await openComplaint(adminPage);
    await transition(adminPage, 'INVESTIGATING', 'The customer appeal is being reviewed.');
    await transition(adminPage, 'RESOLVED', 'A final sandbox response has been provided.', 'Final sandbox response following appeal review.');
    await expect(adminPage.getByRole('region', { name: 'Complaint details' }).locator('.complaint-resolution').getByText('Final sandbox response following appeal review.', { exact: true })).toBeVisible();
    await adminPage.screenshot({ path: '../../artifacts/customer-web/admin-complaint-resolution.png', fullPage: true, animations: 'disabled' });
    await openComplaint(page);
    await transition(page, 'CLOSED', 'I accept the final sandbox response.');
    await expect(page.getByRole('region', { name: 'Complaint details' }).locator('.complaint-resolution').getByText('Final sandbox response following appeal review.', { exact: true })).toBeVisible();
    await expect(page.locator('.complaint-timeline > li')).toHaveCount(8);
    await page.screenshot({ path: '../../artifacts/customer-web/customer-closed-complaint.png', fullPage: true, animations: 'disabled' });
  } finally { await admin.close(); }
});
