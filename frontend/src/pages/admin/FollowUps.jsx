import ScheduleListPage from '../../components/ScheduleListPage.jsx';

const FollowUps = () => (
  <ScheduleListPage
    title="Follow Ups"
    subtitle="Who's handling follow-ups, and where things stand."
    apiPath="/schedule/followups"
  />
);

export default FollowUps;