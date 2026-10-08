import { ButtonLink, Section } from '@/components/ui'

export default function NotFoundPage() {
  return (
    <div className="page-enter">
      <Section tone="deep" className="min-h-[70vh]">
        <div className="mx-auto w-full max-w-3xl px-5 py-16 text-center sm:px-6">
          <p className="numeric text-gradient text-[7rem] font-extrabold leading-none sm:text-[10rem]">
            404
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--text-strong)] sm:text-3xl">
            Page not found
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-muted)]">
            That fixture didn&rsquo;t get played. The page you&rsquo;re looking for may have moved,
            been renamed, or never existed.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/" size="lg">
              Back to home
            </ButtonLink>
            <ButtonLink to="/standings" variant="outline" size="lg">
              View standings
            </ButtonLink>
          </div>
        </div>
      </Section>
    </div>
  )
}