import {
  AboutStrip,
  Formats,
  Hero,
  JoinCta,
  NewsSection,
  ResultsPreview,
  Sponsors,
  StandingsPreview,
} from '@/components/home'

export default function HomePage() {
  return (
    <div className="page-enter">
      <Hero />
      <Formats />
      <StandingsPreview />
      <ResultsPreview />
      <AboutStrip />
      <NewsSection />
      <Sponsors />
      <JoinCta />
    </div>
  )
}