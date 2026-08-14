"use client";

import {
  Bell,
  Search,
  Sparkles,
  UserCircle2,
} from "lucide-react";

export default function Topbar() {
  return (
    <header className="h-20 border-b border-gray-800 bg-[#09090B]/90 backdrop-blur-xl flex items-center justify-between px-8">

      {/* Search */}

      <div className="flex items-center bg-[#111827] rounded-xl px-4 py-3 w-[420px] border border-gray-800">

        <Search className="text-gray-400 mr-3" size={18} />

        <input
          placeholder="Search anything... invoices, bots, workflows..."
          className="bg-transparent outline-none w-full text-white placeholder:text-gray-500"
        />

      </div>

      {/* Right Side */}

      <div className="flex items-center gap-5">

        <button className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 rounded-xl font-semibold hover:scale-105 transition">

          <Sparkles size={18} />

          Ask J10 AI

        </button>

        <button className="relative p-3 rounded-xl bg-[#111827] hover:bg-[#1F2937] transition">

          <Bell /> 

          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>

        </button> 

        <button className="flex items-center gap-3 bg-[#111827] px-4 py-2 rounded-xl hover:bg-[#1F2937] transition">

          <UserCircle2 size={34} />

          <div className="text-left">

            <p className="text-white font-semibold">
              CEO
            </p>

            <p className="text-xs text-gray-400">
              Founder
            </p>

          </div>

        </button>

      </div>

    </header>
  );
}