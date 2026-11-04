const featureCards = [
  {
    title: "Trusted sellers",
    text: "Discover vetted stores and local brands across Somalia with transparent reviews.",
  },
  {
    title: "Fast delivery",
    text: "From groceries to electronics, buyers can find reliable delivery from nearby vendors.",
  },
  {
    title: "Secure checkout",
    text: "Simple and testing, safe payment flows built for modern online commerce and repeat buying.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_#fef3c7_0%,_#f7f7f5_38%,_#f0fdf4_100%)] text-slate-900">
      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-20 sm:px-10 lg:px-12">
        <div className="mb-8 inline-flex w-fit items-center rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-medium text-emerald-800 shadow-sm backdrop-blur">
          Somali Multivendor Marketplace
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h1 className="max-w-xl text-4xl font-black tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Shop the best of local Somali commerce in one place.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              Connect shoppers with trusted vendors, fresh products, and convenient delivery across cities and communities.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <a
                href="#marketplace"
                className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500"
              >
                Explore marketplace
              </a>
              <a
                href="#vendors"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-100"
              >
                Become a vendor
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-emerald-100 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm">
            <div className="rounded-2xl bg-slate-900 p-6 text-white">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>Market pulse</span>
                <span>Live</span>
              </div>
              <div className="mt-8 space-y-5">
                <div>
                  <p className="text-3xl font-bold">12.4K</p>
                  <p className="text-sm text-slate-300">buyers this month</p>
                </div>
                <div className="flex gap-3 text-sm text-slate-200">
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-emerald-300">+18.2%</span>
                  <span>growth in local orders</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="marketplace" className="mx-auto w-full max-w-6xl px-6 pb-20 sm:px-10 lg:px-12">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Why shoppers choose us</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {featureCards.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-lg text-emerald-700">
                ✓
              </div>
              <h2 className="text-xl font-semibold text-slate-900">{feature.title}</h2>
              <p className="mt-3 text-base leading-7 text-slate-600">{feature.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
