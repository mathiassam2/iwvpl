import {
  AboutStrip,
  Formats,
  Hero,
  JoinCta,
  NewsSection,
  ResultsPreview,
  Sponsors,
} from '@/components/home'

export default function HomePage() {
  return (
    <div className="page-enter">
      <Hero />
      <Formats />
      <ResultsPreview />
      <AboutStrip />
      <NewsSection />
      <Sponsors />
      <JoinCta />
    </div>
  )
}