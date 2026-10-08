export interface SocialLink {
  label: string
  href: string
}

export interface SiteMeta {
  name: string
  shortName: string
  tagline: string
  subtitle: string
  description: string
  url: string
  email: string
  base: string
  copyright: string
  disclaimer: string
  social: SocialLink[]
  season: string
  registrationFee: string
  teamCap: number
  teamsRegistered: number
}

export interface NavItem {
  label: string
  href: string
}

export interface Format {
  name: string
  tag: string
  desc: string
}

export interface FaqItem {
  q: string
  a: string
}

export interface Standing {
  pos: number
  team: string
  flag: string
  pl: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  gd: number
  pts: number
  form: string[]
  logo: string
  code: string
}

export interface StandingDivision {
  columns: string[]
  rows: Standing[]
}

export interface Match {
  date: string
  time: string
  home: string
  home_flag: string
  home_logo: string
  away: string
  away_flag: string
  away_logo: string
  score: string
  hs: string
  as: string
  url: string
  homeLogo?: string
  awayLogo?: string
}

export type ClubStatus = 'Active' | 'Non-Active' | 'Pending Approval' | ''

export interface Club {
  name: string
  flag: string
  code: string
  url: string
  logo: string
  logoLocal: string
  players: number
  status: ClubStatus
  raw: string
}

export interface LeaderboardRow {
  pos: number
  name: string
  team: string
  team_flag: string
  value: number
  avatar: string
  team_logo: string
  url: string
  avatarLocal: string
  teamLogoLocal: string
}

export interface Leaderboard {
  title: string
  rows: LeaderboardRow[]
}

export interface NewsPost {
  id: number
  slug: string
  title: string
  date: string
  categories: string[]
  tags: string[]
  excerpt: string
  body: string
  images: string[]
  featured: string
  featuredLocal: string
}

export interface Product {
  slug: string
  name: string
  kicker: string
  price: string
  image: string
  summary: string
  validFor: string
  access: string
  features: string
  note: string
}

export interface AssetRecord {
  source: string
  bucket: string
  name: string
  original: string
  file: string
  format: string
  bytes?: number
  width?: number
  height?: number
  link: string
  title: string
  alt: string
}

export interface TransferSide {
  name: string
  logo: string
  emoji: string
  free: boolean
  logoLocal: string
}

export interface Transfer {
  date: string
  player: string
  from: TransferSide
  to: TransferSide
}

export interface SiteData {
  site: SiteMeta
  navigation: NavItem[]
  formats: Format[]
  communities: string[]
  about: { intro: string; vision: string; faq: FaqItem[] }
  standings: Standing[]
  standingsByDivision: Record<string, StandingDivision>
  results: Match[]
  clubs: Club[]
  leaderboards: Leaderboard[]
  news: NewsPost[]
  leagues: string[]
  divisions: string[]
  seasons: string[]
  products: Product[]
  transfers: Transfer[]
  assets: { records: AssetRecord[]; counts: Record<string, number>; total: number }
}