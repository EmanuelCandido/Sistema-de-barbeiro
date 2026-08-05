import { lazy, Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
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
    <Suspense fallback={<div className="shell"><div className="skeleton skeleton--short" aria-label="Carregando" /></div>}>
      <Switch>
        <Route path="/" component={BookingPage} />
        <Route path="/confirmacao" component={ConfirmationPage} />
        <Route path="/agendamento/:bookingId" component={ManageBookingPage} />
        <Route path="/indisponivel" component={UnavailablePage} />
        <Redirect to="/" replace />
      </Switch>
    </Suspense>
  );
}
