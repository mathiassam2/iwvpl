import {
  AboutStrip,
  Formats,
  Hero,
  JoinCta,
  Nations,
  NewsSection,
  ResultsPreview,
  Sponsors,
} from '@/components/home'

export default function HomePage() {
  return (
    <div className="page-enter">
      <Hero />
      <Nations />
      <Formats />
      <ResultsPreview />
      <AboutStrip />
      <NewsSection />
      <Sponsors />
      <JoinCta />
    </div>
  )
}