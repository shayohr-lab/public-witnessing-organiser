import { Link } from "react-router-dom";
import landing from "@/assets/landing.webp";

// First screen of the app: the full welcome picture. The Register and Log In
// buttons are part of the picture, so invisible links are laid over them
// (positions are percentages of the 1024 × 1536 image, so they scale with it).
// Both lead to the introduction page (/welcome).
const hit =
  "absolute left-[10.5%] w-[79%] rounded-[2.2%/14%] outline-none focus-visible:ring-4 focus-visible:ring-primary/60 active:bg-black/10";

export default function Landing() {
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-end overflow-hidden bg-[#C4E5FE] md:justify-center">
      {/* wide screens: the same picture, blurred, fills the space beside it */}
      <div
        aria-hidden="true"
        className="absolute inset-0 hidden scale-110 bg-cover bg-center opacity-70 blur-2xl md:block"
        style={{ backgroundImage: `url(${landing})` }}
      />
      {/* the picture always fits on screen: as wide as the phone, at most 480 px, never taller than the screen */}
      <div className="relative w-[min(100%,480px,calc(100dvh*2/3))]">
        <img
          src={landing}
          width={1024}
          height={1536}
          className="block h-auto w-full select-none [mask-image:linear-gradient(to_bottom,transparent,black_6%)] md:rounded-3xl md:shadow-2xl md:[mask-image:none]"
          draggable={false}
          alt="Welcome to Public Witnessing Organizer. Organize and schedule your public witnessing activity. Publishers talking with people beside a literature cart on the Dar es Salaam waterfront."
        />
        <Link to="/welcome" aria-label="Register" className={`${hit} top-[82.8%] h-[6.5%]`} />
        <Link to="/welcome" aria-label="Log in" className={`${hit} top-[89.7%] h-[6.3%]`} />
      </div>
    </div>
  );
}
