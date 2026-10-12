type IconProps = { className?: string };

function cls(name: string, extra?: string) {
  return `tribe-common-c-svgicon tribe-common-c-svgicon--${name}${extra ? ` ${extra}` : ""}`;
}

const SEARCH_PATH =
  "M11.164 10.133L16 14.97 14.969 16l-4.836-4.836a6.225 6.225 0 01-3.875 1.352 6.24 6.24 0 01-4.427-1.832A6.272 6.272 0 010 6.258 6.24 6.24 0 011.831 1.83 6.272 6.272 0 016.258 0c1.67 0 3.235.658 4.426 1.831a6.272 6.272 0 011.832 4.427c0 1.422-.48 2.773-1.352 3.875zM6.258 1.458c-1.28 0-2.49.498-3.396 1.404-1.866 1.867-1.866 4.925 0 6.791a4.774 4.774 0 003.396 1.405c1.28 0 2.489-.498 3.395-1.405 1.867-1.866 1.867-4.924 0-6.79a4.774 4.774 0 00-3.395-1.405z";

const MONTH_PATH =
  "M0 .991v17.04c0 .236.162.428.361.428h17.175c.2 0 .361-.192.361-.429V.991c0-.237-.162-.428-.361-.428H.36C.161.563 0 .754 0 .99zm.985.803H16.89v2.301H.985v-2.3zM16.89 5.223H.985v12H16.89v-12zM6.31 7.366v.857c0 .237.192.429.429.429h.857a.429.429 0 00.428-.429v-.857a.429.429 0 00-.428-.429H6.74a.429.429 0 00-.429.429zm3.429.857v-.857c0-.237.191-.429.428-.429h.857c.237 0 .429.192.429.429v.857a.429.429 0 01-.429.429h-.857a.429.429 0 01-.428-.429zm3.428-.857v.857c0 .237.192.429.429.429h.857a.429.429 0 00.428-.429v-.857a.429.429 0 00-.428-.429h-.857a.429.429 0 00-.429.429zm-6.857 4.286v-.858c0-.236.192-.428.429-.428h.857c.236 0 .428.192.428.428v.858a.429.429 0 01-.428.428H6.74a.429.429 0 01-.429-.428zm3.429-.858v.858c0 .236.191.428.428.428h.857a.429.429 0 00.429-.428v-.858a.429.429 0 00-.429-.428h-.857a.428.428 0 00-.428.428zm3.428.858v-.858c0-.236.192-.428.429-.428h.857c.236 0 .428.192.428.428v.858a.429.429 0 01-.428.428h-.857a.429.429 0 01-.429-.428zm-10.286-.858v.858c0 .236.192.428.429.428h.857a.429.429 0 00.429-.428v-.858a.429.429 0 00-.429-.428h-.857a.429.429 0 00-.429.428zm0 4.286v-.857c0-.237.192-.429.429-.429h.857c.237 0 .429.192.429.429v.857a.429.429 0 01-.429.429h-.857a.429.429 0 01-.429-.429zm3.429-.857v.857c0 .237.192.429.429.429h.857a.429.429 0 00.428-.429v-.857a.429.429 0 00-.428-.429H6.74a.429.429 0 00-.429.429zm3.429.857v-.857c0-.237.191-.429.428-.429h.857c.237 0 .429.192.429.429v.857a.429.429 0 01-.429.429h-.857a.429.429 0 01-.428-.429z";

const DAY_PATH =
  "M.363 17.569V.43C.363.193.526 0 .726 0H18c.201 0 .364.193.364.431V17.57c0 .238-.163.431-.364.431H.726c-.2 0-.363-.193-.363-.431zm16.985-16.33H1.354v2.314h15.994V1.24zM1.354 4.688h15.994v12.07H1.354V4.687zm11.164 9.265v-1.498c0-.413.335-.748.748-.748h1.498c.413 0 .748.335.748.748v1.498a.749.749 0 01-.748.748h-1.498a.749.749 0 01-.748-.748z";

export function DotIcon({ which }: { which: "first" | "second" | "third" }) {
  return (
    <svg className={cls("dot", `tribe-common-c-loader__dot tribe-common-c-loader__dot--${which}`)} aria-hidden="true" viewBox="0 0 15 15" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7.5" cy="7.5" r="7.5" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg className={cls("search", className)} aria-hidden="true" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d={SEARCH_PATH} />
    </svg>
  );
}

export function ListIcon({ className, clipId }: IconProps & { clipId: string }) {
  return (
    <svg className={cls("list", className)} aria-hidden="true" viewBox="0 0 19 19" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M.451.432V17.6c0 .238.163.432.364.432H18.12c.2 0 .364-.194.364-.432V.432c0-.239-.163-.432-.364-.432H.815c-.2 0-.364.193-.364.432zm.993.81h16.024V3.56H1.444V1.24zM17.468 3.56H1.444v13.227h16.024V3.56z" className="tribe-common-c-svgicon__svg-fill" />
      <g clipPath={`url(#${clipId}-0)`} className="tribe-common-c-svgicon__svg-fill">
        <path fillRule="evenodd" clipRule="evenodd" d="M11.831 4.912v1.825c0 .504.409.913.913.913h1.825a.913.913 0 00.912-.913V4.912A.913.913 0 0014.57 4h-1.825a.912.912 0 00-.913.912z" />
        <path d="M8.028 7.66a.449.449 0 00.446-.448v-.364c0-.246-.2-.448-.446-.448h-4.13a.449.449 0 00-.447.448v.364c0 .246.201.448.447.448h4.13zM9.797 5.26a.449.449 0 00.447-.448v-.364c0-.246-.201-.448-.447-.448h-5.9a.449.449 0 00-.446.448v.364c0 .246.201.448.447.448h5.9z" />
      </g>
      <g clipPath={`url(#${clipId}-1)`} className="tribe-common-c-svgicon__svg-fill">
        <path fillRule="evenodd" clipRule="evenodd" d="M11.831 10.912v1.825c0 .505.409.913.913.913h1.825a.913.913 0 00.912-.912v-1.825A.913.913 0 0014.57 10h-1.825a.912.912 0 00-.913.912z" />
        <path d="M8.028 13.66a.449.449 0 00.446-.448v-.364c0-.246-.2-.448-.446-.448h-4.13a.449.449 0 00-.447.448v.364c0 .246.201.448.447.448h4.13zM9.797 11.26a.449.449 0 00.447-.448v-.364c0-.246-.201-.448-.447-.448h-5.9a.449.449 0 00-.446.448v.364c0 .246.201.448.447.448h5.9z" />
      </g>
      <defs>
        <clipPath id={`${clipId}-0`}>
          <path transform="translate(3.451 4)" d="M0 0h13v4H0z" />
        </clipPath>
        <clipPath id={`${clipId}-1`}>
          <path transform="translate(3.451 10)" d="M0 0h13v4H0z" />
        </clipPath>
      </defs>
    </svg>
  );
}

export function MonthIcon({ className }: IconProps) {
  return (
    <svg className={cls("month", className)} aria-hidden="true" viewBox="0 0 18 19" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d={MONTH_PATH} className="tribe-common-c-svgicon__svg-fill" />
    </svg>
  );
}

export function DayIcon({ className }: IconProps) {
  return (
    <svg className={cls("day", className)} aria-hidden="true" viewBox="0 0 19 18" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d={DAY_PATH} className="tribe-common-c-svgicon__svg-fill" />
    </svg>
  );
}

export function CaretLeftIcon({ className }: IconProps) {
  return (
    <svg className={cls("caret-left", className)} aria-hidden="true" viewBox="0 0 10 16" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.7 14.4l-1.5 1.5L.3 8 8.2.1l1.5 1.5L3.3 8l6.4 6.4z" />
    </svg>
  );
}

export function CaretRightIcon({ className }: IconProps) {
  return (
    <svg className={cls("caret-right", className)} aria-hidden="true" viewBox="0 0 10 16" xmlns="http://www.w3.org/2000/svg">
      <path d="M.3 1.6L1.8.1 9.7 8l-7.9 7.9-1.5-1.5L6.7 8 .3 1.6z" />
    </svg>
  );
}

export function CaretDownIcon({ className }: IconProps) {
  return (
    <svg className={cls("caret-down", className)} aria-hidden="true" viewBox="0 0 10 7" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M1.008.609L5 4.6 8.992.61l.958.958L5 6.517.05 1.566l.958-.958z" className="tribe-common-c-svgicon__svg-fill" />
    </svg>
  );
}

export function MessagesNotFoundIcon() {
  return (
    <svg className={cls("messages-not-found", "tribe-events-c-messages__message-icon-svg")} aria-hidden="true" viewBox="0 0 21 23" xmlns="http://www.w3.org/2000/svg">
      <g fillRule="evenodd">
        <path d="M.5 2.5h20v20H.5z" />
        <path strokeLinecap="round" d="M7.583 11.583l5.834 5.834m0-5.834l-5.834 5.834" className="tribe-common-c-svgicon__svg-stroke" />
        <path strokeLinecap="round" d="M4.5.5v4m12-4v4" />
        <path strokeLinecap="square" d="M.5 7.5h20" />
      </g>
    </svg>
  );
}

export function CalExportIcon({ className }: IconProps) {
  return (
    <svg className={cls("cal-export", className)} aria-hidden="true" viewBox="0 0 23 17" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M.128.896V16.13c0 .211.145.383.323.383h15.354c.179 0 .323-.172.323-.383V.896c0-.212-.144-.383-.323-.383H.451C.273.513.128.684.128.896Zm16 6.742h-.901V4.679H1.009v10.729h14.218v-3.336h.901V7.638ZM1.01 1.614h14.218v2.058H1.009V1.614Z" />
      <path d="M20.5 9.846H8.312M18.524 6.953l2.89 2.909-2.855 2.855" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
