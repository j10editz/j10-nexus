"use client";

import { Plus } from "lucide-react";

interface CreateEmployeeButtonProps {
  onClick: () => void;
}

export default function CreateEmployeeButton({
  onClick,
}: CreateEmployeeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-zinc-200 active:scale-95"
    >
      <Plus size={16} />
      Create Employee
    </button>
  );
}