interface NotikaLogoProps {
  className?: string;
}

export function NotikaLogo({ className = 'h-7 w-7' }: NotikaLogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="3"
        width="30"
        height="30"
        rx="9"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M11.5 24.5V11.5L20.5 22V11.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M25 11.5L26.2 14.3L29 15.5L26.2 16.7L25 19.5L23.8 16.7L21 15.5L23.8 14.3L25 11.5Z"
        fill="currentColor"
      />
      <circle cx="25" cy="24" r="1.8" fill="currentColor" />
    </svg>
  );
}
