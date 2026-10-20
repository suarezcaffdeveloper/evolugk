import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Statement } from "@/components/Statement";
import { Showcase } from "@/components/Showcase";
import { HScroll } from "@/components/HScroll";
import { Videos } from "@/components/Videos";
import { Portal } from "@/components/Portal";
import { Roles } from "@/components/Roles";
import { HowItWorks } from "@/components/HowItWorks";
import { Facts } from "@/components/Facts";
import { Privacy } from "@/components/Privacy";
import { Pricing } from "@/components/Pricing";
import { Faq } from "@/components/Faq";
import { Cta } from "@/components/Cta";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Statement />
        <Showcase />
        <HScroll />
        <Videos />
        <Portal />
        <Roles />
        <HowItWorks />
        <Facts />
        <Privacy />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
