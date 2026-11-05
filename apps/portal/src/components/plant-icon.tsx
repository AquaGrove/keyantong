export function PlantIcon({ type = "leaf" }: { type?: string }) {
  const base = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={`plant-icon plant-${type}`}
      {...base}
    >
      {type === "potato" ? (
        <>
          <path
            fill="#e6c59b"
            d="M12 25C5 40 18 54 34 50c12-2 23-13 19-25-4-13-20-19-29-10-4 4-8 3-12 10Z"
          />
          <path
            d="m22 25 2 2m16 2 1 2m-13 9 2-1m15-2 2 1M34 19l-1 2"
            stroke="#956338"
          />
        </>
      ) : type === "grain" || type === "maize" ? (
        <>
          <path d="M31 55V13m0 15L20 19m11 17 12-12m-12 19L18 33m13 17 13-10" />
          <path
            fill="#e1c879"
            d="M27 28c-11 0-14-8-11-13 9 1 13 6 11 13Zm8 8c-2-9 2-16 11-17 3 9-2 15-11 17ZM27 43c-10 0-15-5-14-13 10 0 15 6 14 13Zm8 7c-1-10 5-15 14-15 0 9-5 14-14 15ZM31 23c-7-7-5-14 1-18 7 7 5 13-1 18Z"
          />
        </>
      ) : type === "tree" ? (
        <>
          <path d="M30 55V30m1 15L19 35m13 4 11-9" />
          <path
            fill="#9dc8a7"
            d="M13 33c-10-9-1-20 8-18C23 1 43 3 44 17c15-1 18 16 7 21-9 5-29 7-38-5Z"
          />
        </>
      ) : type === "flower" || type === "cotton" ? (
        <>
          <path d="M32 55V29m0 17c-11 1-16-5-18-12 12-2 18 4 18 12Zm0 6c11 0 17-6 18-13-12-1-18 5-18 13Z" />
          <path
            fill={type === "cotton" ? "#fff" : "#ead2a2"}
            d="M31 12c8-14 18-3 13 5 16 0 15 16 3 18 3 14-13 18-18 7-12 8-23-5-13-14-10-10 1-23 15-16Z"
          />
          <circle cx="31" cy="27" r="6" fill="#d3ae59" />
        </>
      ) : type === "bean" ? (
        <>
          <path
            fill="#a9c594"
            d="M15 16c12 9 30-2 36 11s-16 31-29 24C4 42 4 24 15 16Z"
          />
          <path d="M16 25c1 12 13 23 27 9" />
          <circle cx="19" cy="30" r="3" />
          <circle cx="27" cy="37" r="3" />
          <circle cx="38" cy="37" r="3" />
        </>
      ) : type === "fruit" || type === "pepper" ? (
        <>
          <path
            fill="#db9c83"
            d="M31 21c-27-15-29 29-5 32 5 0 6-2 9-1 23 7 28-39-4-31Z"
          />
          <path d="M31 23V11m1 6c5-10 13-10 18-5-5 8-12 9-18 5Z" />
        </>
      ) : type === "root" ? (
        <>
          <path fill="#e1b081" d="M20 25h25L30 58Z" />
          <path d="M31 25V9m0 10L19 9m13 7L44 6m-21 30 10 1m-6 9h7" />
        </>
      ) : (
        <>
          <path fill="#afcdb5" d="M11 45C5 16 33 12 53 9c3 27-11 45-37 41Z" />
          <path d="M10 56 44 21M26 38V24m2 12 13 2" />
        </>
      )}
    </svg>
  );
}
