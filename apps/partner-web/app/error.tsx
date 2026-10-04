'use client';
export default function Error({reset}: {reset: ()=>void}) { return <main className="standalone"><h1>We could not load this page.</h1><p>Please try again. Your saved work remains available.</p><button onClick={reset}>Try again</button></main>; }
