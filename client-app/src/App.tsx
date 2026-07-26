import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { BookingPage } from "./pages/BookingPage";

const ConfirmationPage = lazy(() =>
  import("./pages/ConfirmationPage").then(module => ({ default: module.ConfirmationPage })),
);
const ManageBookingPage = lazy(() =>
  import("./pages/ManageBookingPage").then(module => ({ default: module.ManageBookingPage })),
);
const UnavailablePage = lazy(() =>
  import("./pages/UnavailablePage").then(module => ({ default: module.UnavailablePage })),
);

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="shell"><div className="skeleton skeleton--short" aria-label="Carregando" /></div>}>
        <Routes>
          <Route path="/" element={<BookingPage />} />
          <Route path="/confirmacao" element={<ConfirmationPage />} />
          <Route path="/agendamento/:bookingId" element={<ManageBookingPage />} />
          <Route path="/indisponivel" element={<UnavailablePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
