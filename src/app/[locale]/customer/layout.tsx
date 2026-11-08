import type { ReactNode } from "react";
import { SupportLauncher } from "@/features/support/components/support-portal";

export default function CustomerAreaLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      {children}
      <SupportLauncher audience="customer" />
    </>
  );
}
