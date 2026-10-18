import { CrestWall } from '@/components/home/CrestWall'
import { IslandRail } from '@/components/home/IslandRail'
import { Scroller } from '@/components/home/Scroller'
import { Statement } from '@/components/home/Statement'
import {
  AboutStrip,
  Formats,
  Hero,
  NewsSection,
  Sponsors,
} from '@/components/home'

/**
 * Home page order is doing real work here.
 *
 * The hero lands, then the ticker proves the league has real match data in it
 * before anything asks for attention. `IslandRail` is the centrepiece and
 * takes over the frame completely while it runs. `Statement` is the release
 * valve - a lot of movement needs somewhere to stop.
 *
 * There is no preloader. One was here and it covered the whole page in near
 * opaque ink for its whole run, so every fresh visit began behind a dark
 * sheet rather than at the artwork. The hero is the first thing painted and
 * is the LCP element; nothing needs to stand in front of it.
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
      <Hero />
      <Scroller />
      <IslandRail />
      <Statement />
      <Formats />
      <CrestWall />
      <AboutStrip />
      <NewsSection />
      <Sponsors />
    </div>
  )
}