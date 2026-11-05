import Image from "next/image";

const homeDecor = {
  plants: ["01_rice", "02_maize", "03_bean", "04_potato", "05_roots"],
  research: ["07_literature", "08_research_network", "09_botanical_data", "06_flower_fruit_seed"],
};

function HomeDecor({ group }: { group: keyof typeof homeDecor }) {
  return (
    <div className={`conversation-decor decor-${group}`} aria-hidden="true">
      {homeDecor[group].map((asset) => (
        <div className="conversation-decor-tile" key={asset}>
          <Image
            src={`/images/home-decor/${asset}.webp`}
            alt=""
            fill
            unoptimized
          />
        </div>
      ))}
    </div>
  );
}

export function ConversationBackground() {
  return (
    <div className="conversation-home-art" aria-hidden="true">
      <Image
        className="conversation-home-landscape"
        src="/images/conversation-research-v1.png"
        alt=""
        fill
        sizes="(max-width: 700px) 100vw, 900px"
      />
      <HomeDecor group="plants" />
      <HomeDecor group="research" />
    </div>
  );
}
