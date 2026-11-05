/** Decorative botanical / research illustrations (user-provided, optimized under /decor). */
export type DecorVariant = "home" | "sparse" | "tools" | "about";

const SETS: Record<DecorVariant, { src: string; className: string }[]> = {
  home: [
    { src: "/decor/rice.webp", className: "page-decor-item page-decor-bl" },
    { src: "/decor/bean.webp", className: "page-decor-item page-decor-tl" },
    { src: "/decor/literature.webp", className: "page-decor-item page-decor-tr" },
    { src: "/decor/roots.webp", className: "page-decor-item page-decor-br" },
  ],
  sparse: [
    { src: "/decor/network.webp", className: "page-decor-item page-decor-tr" },
    { src: "/decor/flower.webp", className: "page-decor-item page-decor-bl" },
  ],
  tools: [
    { src: "/decor/botanical.webp", className: "page-decor-item page-decor-tr" },
    { src: "/decor/maize.webp", className: "page-decor-item page-decor-bl" },
  ],
  about: [
    { src: "/decor/potato.webp", className: "page-decor-item page-decor-tl" },
    { src: "/decor/network.webp", className: "page-decor-item page-decor-br" },
  ],
};

export function PageDecor({ variant = "home" }: { variant?: DecorVariant }) {
  const items = SETS[variant] || SETS.sparse;
  return (
    <div className={`page-decor page-decor-${variant}`} aria-hidden="true">
      {items.map((it) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={it.src + it.className} src={it.src} alt="" className={it.className} loading="lazy" decoding="async" />
      ))}
    </div>
  );
}
