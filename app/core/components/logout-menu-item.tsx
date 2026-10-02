import type { ReactNode } from "react";

import { useSubmit } from "react-router";

import { DropdownMenuItem } from "./ui/dropdown-menu";

export default function LogoutMenuItem({ children }: { children: ReactNode }) {
  const submit = useSubmit();

  return (
    <DropdownMenuItem
      onSelect={() => submit(null, { action: "/logout", method: "post" })}
    >
      {children}
    </DropdownMenuItem>
  );
}
