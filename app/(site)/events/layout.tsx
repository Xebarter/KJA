import { TecStyles } from "@/components/site/tec/TecStyles";

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TecStyles />
      {children}
    </>
  );
}
