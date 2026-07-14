import Header from "@/components/Header";
import WalletBanner from "@/components/WalletBanner";
import HeroSection from "@/components/HeroSection";
import MetricsBar from "@/components/MetricsBar";
import DashboardPanel from "@/components/DashboardPanel";
import FeaturesSection from "@/components/FeaturesSection";
import TickerTape from "@/components/TickerTape";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div
      className="relative min-h-screen overflow-x-hidden"
      style={{ background: "#080808" }}
    >
      {/* Subtle top emerald glow — single soft light source */}
      <div
        style={{
          position: "fixed",
          top: -120,
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          height: 320,
          background: "radial-gradient(ellipse, rgba(201,168,76,0.07) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Content */}
      <div className="relative" style={{ zIndex: 10 }}>
        <Header />
        <WalletBanner />
        <TickerTape />
        <HeroSection />
        <MetricsBar />
        <DashboardPanel />
        <FeaturesSection />
        <Footer />
      </div>
    </div>
  );
}
