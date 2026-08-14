"use client";

import { Search } from "lucide-react";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function SearchBar({
  value,
  onChange,
}: SearchBarProps) {
  return (
    <div className="relative w-full max-w-md">
      <Search
        size={17}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
      />

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search AI employees..."
        className="
          w-full rounded-xl
          border border-white/[0.08]
          bg-[#111216]
          py-3 pl-11 pr-4
          text-sm text-white
          outline-none
          transition
          placeholder:text-zinc-600
          focus:border-blue-500/30
        "
      />
    </div>
  );
}