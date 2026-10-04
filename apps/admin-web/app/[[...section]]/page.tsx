import { Portal } from "@insurance/ui";
export default async function Page({params}: {params: Promise<{section?: string[]}>}) { const {section} = await params; return <Portal mode="admin" section={section?.[0]} />; }
