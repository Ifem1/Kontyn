import { KontynApp } from "../../../components/KontynApp";
export default async function Page({params}:{params:Promise<{section:string}>}) { const {section}=await params; return <KontynApp route={section[0].toUpperCase()+section.slice(1)} />; }
