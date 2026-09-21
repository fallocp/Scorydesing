import type { DemoState } from './types';
import { Shell } from './ui/Shell';
import { Home } from './pages/Home';
import { Create } from './pages/Create';
import { Library } from './pages/Library';
import { Editor } from './pages/Editor';
import { BrandPage, VisualSystem } from './pages/System';
/** Pure view. Real business actions must be mapped to the existing app, not to demo-controller. */
export function DesignView({state}:{state:DemoState}) {
  return <Shell state={state}>{state.view==='home'?<Home state={state}/>:state.view==='create'?<Create state={state}/>:state.view==='library'?<Library state={state}/>:state.view==='editor'?<Editor state={state}/>:state.view==='brand'?<BrandPage/>:<VisualSystem/>}</Shell>;
}
