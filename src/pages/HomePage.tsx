import { Preloader } from '@/components/home/Preloader'
import { CrestWall } from '@/components/home/CrestWall'
import { IslandRail } from '@/components/home/IslandRail'
import { ScrollCue } from '@/components/home/ScrollCue'
import { Scroller } from '@/components/home/Scroller'
import { Statement } from '@/components/home/Statement'
import {
  AboutStrip,
  Formats,
  Hero,
  JoinCta,
  NewsSection,
  ResultsPreview,
  Sponsors,
} from '@/components/home'

/**
 * Home page order is doing real work here.
 *
 * The hero lands, then `ScrollCue` invites the scroll, then the ticker
 * proves the league has real match data in it before anything asks for
 * attention. `IslandRail` is the centrepiece and takes over the frame
 * completely while it runs. `Statement` is the release valve — a lot of
 * movement needs somewhere to stop.
 *
 * `Nations` used to sit between the hero and `Formats`. It showed the same
 * three campaign frames as the hero in a static three-up, which the rail
 * now does far better and with real club data attached, so it has been
 * dropped from the page. The component is still exported from
 * components/home if it is ever wanted back.
 */
export default function HomePage() {
  return (
    <div className="page-enter">
      <Preloader />
      <Hero />
      <ScrollCue />
      <Scroller />
      <IslandRail />
      <Statement />
      <Formats />
      <CrestWall />
      <ResultsPreview />
      <AboutStrip />
      <NewsSection />
      <Sponsors />
      <JoinCta />
    </div>
  )
}