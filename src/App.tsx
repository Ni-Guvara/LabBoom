// App：路由 + 顶部导航
// 用 HashRouter：兼容离线双击 index.html（file://）、刷新与深链均不 404
import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { TopNav } from '@/shell/TopNav';
import { SubjectSelectPage } from '@/shell/SubjectSelectPage';
import { StageSelectPage } from '@/shell/StageSelectPage';
import { ModuleListPage } from '@/shell/ModuleListPage';
import { KnowledgeMapPage } from '@/graph/KnowledgeMapPage';
import { LabRoute } from '@/routes/LabRoute';
import { ConceptCabin } from '@/topics/ConceptCabin';
import { ModelStudio } from '@/labs/_dev/ModelStudio';

function CabinRoute() {
  const { chapterId = 'M1' } = useParams();
  return <ConceptCabin chapterId={chapterId} />;
}

// 器材模型试验台（开发用）：/#/model/ticker_timer
function ModelRoute() {
  const { apparatusId = 'ticker_timer' } = useParams();
  return <ModelStudio apparatusId={apparatusId} />;
}

export default function App() {
  return (
    <HashRouter>
      <TopNav />
      <Routes>
        <Route path="/" element={<Navigate to="/subject" replace />} />
        <Route path="/subject" element={<SubjectSelectPage />} />
        <Route path="/stage/:subject" element={<StageSelectPage />} />
        <Route path="/modules/:subject/:stage" element={<ModuleListPage />} />
        <Route path="/lab/:labId" element={<LabRoute />} />
        <Route path="/cabin/:chapterId" element={<CabinRoute />} />
        <Route path="/map" element={<KnowledgeMapPage />} />
        <Route path="/model/:apparatusId" element={<ModelRoute />} />
        <Route path="*" element={<Navigate to="/subject" replace />} />
      </Routes>
    </HashRouter>
  );
}
