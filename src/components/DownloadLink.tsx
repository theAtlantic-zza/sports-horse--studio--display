import type { ReactNode } from "react";
import { BROWSER_DEMO, downloadRecord } from "../api";

export default function DownloadLink({
  id,
  children,
  className,
  label,
  title,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  label?: string;
  title?: string;
}) {
  return (
    <a
      className={className}
      title={title}
      aria-label={label}
      href={BROWSER_DEMO ? "#download" : `/api/records/${id}/download`}
      download
      onClick={
        BROWSER_DEMO
          ? async (event) => {
              event.preventDefault();
              await downloadRecord(id);
            }
          : undefined
      }
    >
      {children}
    </a>
  );
}
