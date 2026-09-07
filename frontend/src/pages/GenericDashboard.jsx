import { LogOut, LayoutGrid } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import ScheduleReminderAlert from '../components/ScheduleReminderAlert.jsx';

// Shown to roles whose dedicated workspace hasn't been built yet
// (manager, post counselor, assistant doctor, psychologist, medicine department, dispatch & courier).
const GenericDashboard = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 bg-teal-950 text-offwhite-100">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-teal-600 flex items-center justify-center">
            <LayoutGrid size={16} strokeWidth={2.5} />
          </div>
          <span className="truncate font-display text-sm font-bold tracking-tight">Manovaidya Operation System</span>
        </div>
        <Button variant="ghost" size="sm" onClick={logout} className="shrink-0 text-offwhite-100 hover:bg-teal-800">
          <LogOut size={15} /><span className="hidden sm:inline">Log out</span>
        </Button>
      </div>

      <div className="flex-1 p-6">
        <ScheduleReminderAlert />
        <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center">
          <Card className="max-w-md w-full text-center">
            <h1 className="font-display text-xl font-bold text-charcoal">Welcome, {user?.name}</h1>
            <p className="mt-2 text-sm text-charcoal/60">
              You're logged in as <span className="font-semibold text-sage">{user?.roleLabel}</span>. Your
              dedicated workspace for this role is being built next.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default GenericDashboard;
