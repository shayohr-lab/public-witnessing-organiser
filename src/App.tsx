import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { isConfigured } from "@/lib/supabase";
import { homeFor } from "@/lib/routes";
import { isStaff } from "@/lib/roles";
import { ToastProvider } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import Welcome from "@/pages/Welcome";
import Register from "@/pages/Register";
import Login from "@/pages/Login";
import Pending from "@/pages/Pending";
import Home from "@/pages/Home";
import Profile from "@/pages/Profile";
import Invites from "@/pages/Invites";
import Alone from "@/pages/Alone";
import Notices from "@/pages/Notices";
import MapPage from "@/pages/MapPage";
import Settings from "@/pages/Settings";
import Notifications from "@/pages/Notifications";
import PrintTimetable from "@/pages/PrintTimetable";
import Admin from "@/pages/admin/Admin";
import Setup from "@/pages/Setup";


function Guard({ children, need }: { children: ReactNode; need: "guest" | "signed-in" | "approved" | "overseer" }) {
  const { session, profile, loading, checkedFor, signOut } = useAuth();
  if (loading || (session && checkedFor !== session.user.id && need !== "guest")) return <Spinner />;
  if (session && !profile && need !== "guest")
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-extrabold">We couldn't load your account</h1>
        <p className="text-muted">Please check your internet connection and try again.</p>
        <button className="h-12 rounded-xl bg-primary font-bold text-white" onClick={() => window.location.reload()}>Try again</button>
        <button className="h-12 rounded-xl border border-line2 bg-white font-bold" onClick={() => signOut()}>Sign out</button>
      </div>
    );
  if (need === "guest") return session && profile ? <Navigate to={homeFor(profile.status)} replace /> : <>{children}</>;
  if (!session) return <Navigate to="/" replace />;
  if (need === "signed-in") return <>{children}</>;
  if (profile?.status !== "approved") return <Navigate to="/pending" replace />;
  if (need === "overseer" && !isStaff(profile)) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

export default function App() {
  if (!isConfigured) return <Setup />;
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Routes>
            <Route path="/" element={<Guard need="guest"><Welcome /></Guard>} />
            <Route path="/register" element={<Guard need="guest"><Register /></Guard>} />
            <Route path="/login" element={<Guard need="guest"><Login /></Guard>} />
            <Route path="/pending" element={<Guard need="signed-in"><Pending /></Guard>} />
            <Route path="/home" element={<Guard need="approved"><Home /></Guard>} />
            <Route path="/profile" element={<Guard need="approved"><Profile /></Guard>} />
            <Route path="/invites" element={<Guard need="approved"><Invites /></Guard>} />
            <Route path="/alone/:bookingId" element={<Guard need="approved"><Alone /></Guard>} />
            <Route path="/notices" element={<Guard need="approved"><Notices /></Guard>} />
            <Route path="/map" element={<Guard need="approved"><MapPage /></Guard>} />
            <Route path="/settings" element={<Guard need="approved"><Settings /></Guard>} />
            <Route path="/notifications" element={<Guard need="approved"><Notifications /></Guard>} />
            <Route path="/print" element={<Guard need="approved"><PrintTimetable /></Guard>} />
            <Route path="/admin" element={<Guard need="overseer"><Admin /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
