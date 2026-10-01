interface PbtClubSectionHeadingProps {
  label: string;
  title: string;
}

export default function PbtClubSectionHeading({
  label,
  title,
}: PbtClubSectionHeadingProps) {
  return (
    <div>
      <p className="text-xs tracking-[0.3em] text-accent">{label}</p>
      <h2 className="mt-2 font-serif text-2xl font-black text-text-light lg:text-4xl">
        {title}
      </h2>
    </div>
  );
}
