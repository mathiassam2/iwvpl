import pathlib
import re

p = pathlib.Path('src/components/home/index.tsx')
s = p.read_text(encoding='utf-8')

# ---------------------------------------------------------------- desktop
old_desktop = """                  <div className="absolute inset-0 hidden lg:block">
                    {poster && (
                      /* Blurred cover behind the whole picture, so letterboxing
                         reads as a soft vignette rather than hard bars. */
                      <img
                        src={s.src}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
                        loading={i === 0 ? 'eager' : 'lazy'}
                        decoding="async"
                      />
                    )}
                    <img
                      src={s.src}
                      alt=""
                      className={cx(
                        'absolute inset-0 h-full w-full transition-all duration-[1100ms]',
                        'ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none',
                        poster ? 'object-contain object-center' : 'object-cover object-center',
                        // Slide 1 never gets the Ken Burns push. It is held
                        // static for the opening, so starting a zoom the moment
                        // the layout arrives reads as the picture snapping back
                        // to a new position.
                        active && !poster && i !== 0 && 'hero-kenburns',
                      )}
                      {...({ fetchpriority: i === 0 ? 'high' : 'low' } as Record<string, string>)}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                    />
                  </div>"""

new_desktop = """                  <div className="absolute inset-0 hidden lg:block">
                    <img
                      src={s.src}
                      alt=""
                      className={cx(
                        'absolute inset-0 h-full w-full object-cover object-center',
                        // Slide 1 is deliberately static: no Ken Burns, and the
                        // object-fit never changes between the opening beat and
                        // the layout. Switching contain -> cover made the whole
                        // picture jump scale the instant the copy arrived.
                        i !== 0 && active && 'hero-kenburns',
                      )}
                      {...({ fetchpriority: i === 0 ? 'high' : 'low' } as Record<string, string>)}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                    />
                  </div>"""
assert old_desktop in s, 'desktop block not found'
s = s.replace(old_desktop, new_desktop)

# ------------------------------------------------------------------ mobile
old_mobile = """                  {/* Mobile uses the SAME artwork as desktop - no separate
                      portrait crop - so the campaign reads identically at every
                      width. During the intro it letterboxes over the blurred
                      backdrop; afterwards it covers. */}
                  <div className="absolute inset-0 lg:hidden">
                    {poster && (
                      <img
                        src={s.src}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <img
                      src={s.src}
                      alt=""
                      className={cx(
                        'absolute inset-0 h-full w-full transition-all duration-[1100ms]',
                        'ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none',
                        poster ? 'object-contain object-center' : 'object-cover object-center',
                        active && !poster && i !== 0 && 'hero-kenburns',
                      )}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                    />
                  </div>"""

new_mobile = """                  {/* Mobile uses the SAME artwork and the SAME fit as desktop,
                      so nothing resizes when the layout settles in. */}
                  <div className="absolute inset-0 lg:hidden">
                    <img
                      src={s.src}
                      alt=""
                      className={cx(
                        'absolute inset-0 h-full w-full object-cover object-center',
                        i !== 0 && active && 'hero-kenburns',
                      )}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                    />
                  </div>"""
assert old_mobile in s, 'mobile block not found'
s = s.replace(old_mobile, new_mobile)

# ------------------------------------------------- scrim: smooth ramp in
old_scrim = """        <div
          className={cx(
            'absolute inset-0 transition-opacity duration-[1100ms]',
            showLayout ? 'opacity-100' : 'opacity-45',
          )}
        >
          <div className="hero-scrim absolute inset-0" />
          <div className="hero-scrim-side absolute inset-y-0 left-0 w-full lg:w-[68%]" />
        </div>"""

new_scrim = """        {/* The scrim ramps from a light wash to the full legibility scrim over
            1.5s, slightly behind the copy. With the picture no longer resizing
            this is the only thing that moves, so it has to read as a deliberate
            fade rather than a step. */}
        <div
          className={cx(
            'absolute inset-0 transition-opacity duration-[1500ms] delay-100',
            'ease-[cubic-bezier(0.33,0,0.15,1)] motion-reduce:transition-none',
            showLayout ? 'opacity-100' : 'opacity-[0.5]',
          )}
        >
          <div className="hero-scrim absolute inset-0" />
          <div className="hero-scrim-side absolute inset-y-0 left-0 w-full lg:w-[68%]" />
        </div>"""
assert old_scrim in s, 'scrim block not found'
s = s.replace(old_scrim, new_scrim)

# `poster` is now only used for the data-mode attribute.
s = s.replace(
    "              const active = i === index\n              const poster = active && fullBleed",
    "              const active = i === index\n              const poster = active && fullBleed",
)
p.write_text(s, encoding='utf-8')
print('slide 1 flush + smooth scrim')
