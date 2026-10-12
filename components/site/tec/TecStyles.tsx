const SHEETS = [
  "datepicker",
  "variables-skeleton",
  "common-skeleton",
  "tooltipster",
  "views-skeleton",
  "variables-full",
  "common-full",
  "views-full",
];

export function TecStyles({ extra = [] }: { extra?: string[] }) {
  return (
    <>
      {[...SHEETS, ...extra].map((name) => (
        <link key={name} rel="stylesheet" href={`/css/tec/${name}.css`} precedence="tec" />
      ))}
    </>
  );
}
