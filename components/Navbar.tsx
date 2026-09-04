import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-8 py-6 border-b border-gray-800">
      <h1 className="text-2xl font-bold text-white">
        J10 <span className="text-blue-500">NEXUS</span>
      </h1>

      <div className="flex gap-6 text-gray-300">
        <a href="#features">Features</a>
        <Link href="/login">Pricing</Link>
        <Link href="/login">Marketplace</Link>
        <a href="mailto:contact@j10-nexus.com">Contact</a>
      </div>

      <Link href="/login" className="bg-blue-600 px-5 py-2 rounded-lg hover:bg-blue-700">
        Start Free
      </Link>
    </nav>
  );
}
