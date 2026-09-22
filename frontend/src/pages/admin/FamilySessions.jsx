import ScheduleListPage from '../../components/ScheduleListPage.jsx';

const FamilySessions = () => (
  <ScheduleListPage
    title="Family Sessions"
    subtitle="Who's handling family sessions, and where things stand."
    apiPath="/schedule/family-sessions"
    showFamilySessionTypeFilter
  />
);

export default FamilySessions;
