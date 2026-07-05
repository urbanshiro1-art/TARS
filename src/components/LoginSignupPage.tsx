import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

const COMETS = [
  { top: -10, left: 20, duration: 4.5, delay: 0, size: 1.2 },
  { top: 10, left: 50, duration: 6, delay: 1, size: 0.9 },
  { top: -20, left: -10, duration: 7, delay: 2, size: 0.7 },
  { top: 30, left: 40, duration: 5, delay: 0.5, size: 1.1 },
  { top: -5, left: 80, duration: 6.5, delay: 3, size: 0.8 },
  { top: 40, left: -20, duration: 8, delay: 1.5, size: 1.0 },
  { top: -15, left: 60, duration: 5.5, delay: 4, size: 1.1 },
  { top: 20, left: 10, duration: 7.5, delay: 2.5, size: 0.7 },
  { top: -25, left: 30, duration: 5, delay: 1.2, size: 1.3 },
  { top: 5, left: 70, duration: 6.8, delay: 2.8, size: 0.65 },
  { top: -12, left: 90, duration: 4.2, delay: 0.2, size: 1.05 },
  { top: 35, left: 15, duration: 7.2, delay: 3.5, size: 0.85 },
  { top: -18, left: 5, duration: 6.2, delay: 1.8, size: 1.15 },
  { top: 15, left: 85, duration: 5.8, delay: 4.5, size: 0.95 },
];

const INITIALIZATION_PHASES = [
  "COGNITIVE DECK INITIALIZATION...",
  "PARSING YAHOO MARKET DATABASES...",
  "ESTABLISHING DATABASE HANDSHAKES...",
  "CALIBRATING SENTIMENT VECTORS...",
  "SYNCHRONIZING TARS NEURAL GRID...",
  "CORE SYSTEM ACTIVE. WELCOME."
];

interface StartupPageProps {
  onStartupComplete: () => void;
}

export default function LoginSignupPage({ onStartupComplete }: StartupPageProps) {
  const [progress, setProgress] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    // Run loading progress over 2.5 seconds
    const duration = 2500;
    const intervalTime = 30;
    const increment = 100 / (duration / intervalTime);

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + increment;
        if (next >= 100) {
          clearInterval(timer);
          return 100;
        }
        return next;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Switch diagnostic phase text as progress advances
    const index = Math.min(
      Math.floor((progress / 100) * INITIALIZATION_PHASES.length),
      INITIALIZATION_PHASES.length - 1
    );
    setPhaseIndex(index);

    if (progress >= 100) {
      const delay = setTimeout(() => {
        onStartupComplete();
      }, 350);
      return () => clearTimeout(delay);
    }
  }, [progress, onStartupComplete]);

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 overflow-hidden font-mono text-white select-none">
      
      {/* Ambient Celestial Comets and Stardust Trails */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-[0.35] sm:opacity-[0.45]">
        {COMETS.map((comet, idx) => (
          <motion.div
            key={idx}
            initial={{ x: '120vw', y: '-20vh' }}
            animate={{ x: '-40vw', y: '140vh' }}
            transition={{
              duration: comet.duration,
              repeat: Infinity,
              ease: 'linear',
              delay: comet.delay,
            }}
            className="absolute pointer-events-none z-0"
            style={{
              top: `${comet.top}%`,
              left: `${comet.left}%`,
              scale: comet.size,
            }}
          >
            <div className="relative">
              {/* Comet trailing stardust tail */}
              <div className="absolute top-0 right-0 w-36 h-[1.5px] bg-gradient-to-l from-transparent via-white/20 to-white origin-right -rotate-[35deg] blur-[0.5px]" />
              {/* Glow core */}
              <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_10px_4px_rgba(255,255,255,0.5)]" />
              
              {/* Falling Stardust Particles */}
              <motion.div 
                className="absolute w-1 h-1 bg-white/80 rounded-full blur-[0.2px]"
                animate={{ x: [0, 25, 50], y: [-8, -18, -28], opacity: [0.9, 0.4, 0] }}
                transition={{ duration: 1.0, repeat: Infinity, ease: "easeOut" }}
                style={{ top: 1, right: 10 }}
              />
              <motion.div 
                className="absolute w-0.5 h-0.5 bg-white/70 rounded-full"
                animate={{ x: [0, 35, 70], y: [-12, -26, -40], opacity: [0.8, 0.3, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut", delay: 0.2 }}
                style={{ top: 2, right: 20 }}
              />
              <motion.div 
                className="absolute w-1 h-1 bg-white/60 rounded-full blur-[0.4px]"
                animate={{ x: [0, 45, 90], y: [-16, -34, -52], opacity: [0.7, 0.2, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
                style={{ top: -1, right: 30 }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Terminal System Init Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-sm bg-black/60 border border-white/10 rounded-lg p-6 sm:p-8 z-10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-sm"
      >
        {/* Diagnostic Loader Frame */}
        <div className="flex flex-col gap-5">
          <div className="flex justify-between items-center border-b border-white/10 pb-3">
            <div>
              <h1 className="text-xs font-bold tracking-[0.3em] text-neutral-300 uppercase">•_• TARS STARTUP</h1>
              <p className="text-[8px] text-neutral-500 uppercase tracking-widest mt-1">
                SYSTEM CALIBRATION SEQUENCES
              </p>
            </div>
            <span className="text-[8px] text-neutral-600 font-bold uppercase tracking-wider">
              SYS_BOOT_v1.2
            </span>
          </div>

          {/* Diagnostic Display */}
          <div className="bg-black/40 border border-white/5 p-4 rounded min-h-[90px] flex flex-col justify-between">
            <div className="space-y-1">
              <div className="text-[9px] text-neutral-500 font-mono tracking-widest">
                [TARS_CORE] ANALYZING...
              </div>
              <div className="text-[10px] text-white font-bold tracking-wider uppercase font-mono animate-pulse">
                &gt; {INITIALIZATION_PHASES[phaseIndex]}
              </div>
            </div>
            <div className="text-[8px] text-neutral-600 font-mono tracking-widest flex justify-between items-center pt-2 border-t border-white/5 mt-2">
              <span>SECURE COMPILATION</span>
              <span>PORT 3000 ACTIVE</span>
            </div>
          </div>

          {/* Loading Progress Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[9px] text-neutral-400 font-mono tracking-widest uppercase">
              <span>ESTABLISHING PARITY</span>
              <span className="font-bold text-white">{Math.floor(progress)}%</span>
            </div>
            
            {/* Real aesthetic custom segmented bar */}
            <div className="h-2 w-full bg-neutral-900 border border-white/10 rounded-sm overflow-hidden p-[1px]">
              <motion.div 
                className="h-full bg-white rounded-xs"
                style={{ width: `${progress}%` }}
                transition={{ ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Core metadata footer */}
          <div className="text-[8px] text-neutral-500 font-mono tracking-wider text-center uppercase">
            COSMIC ANALYTICS SYS — COLD BOOT COMPLETE
          </div>
        </div>
      </motion.div>
    </div>
  );
}
