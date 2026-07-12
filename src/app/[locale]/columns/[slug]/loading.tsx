export default function Loading() {
  return (
    <section className="min-h-screen bg-deep-black py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-6 lg:px-12 space-y-6">
        <div className="h-3 w-32 bg-text-gray/10 animate-pulse" />
        <div className="h-10 w-3/4 bg-text-gray/10 animate-pulse" />
        <div className="aspect-[16/9] bg-text-gray/10 animate-pulse" />
        <div className="space-y-3">
          <div className="h-4 bg-text-gray/10 animate-pulse" />
          <div className="h-4 bg-text-gray/10 animate-pulse" />
          <div className="h-4 w-2/3 bg-text-gray/10 animate-pulse" />
        </div>
      </div>
    </section>
  );
}
