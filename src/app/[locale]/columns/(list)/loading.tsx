export default function Loading() {
  return (
    <section className="min-h-screen bg-deep-black py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border border-text-gray/10">
              <div className="aspect-[16/9] bg-text-gray/10 animate-pulse" />
              <div className="p-5 space-y-3">
                <div className="h-3 w-1/3 bg-text-gray/10 animate-pulse" />
                <div className="h-4 w-full bg-text-gray/10 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
