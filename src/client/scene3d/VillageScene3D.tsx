import { useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  PCFSoftShadowMap,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { DerivedProject, DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot } from '../../shared/activity.js';
import { createCameraController, type CameraProjection } from './cameraController.js';
import { SceneLabels } from './SceneLabels.js';
import { buildSceneContent, syncActivity, type SceneContent } from './sceneFactory.js';

export type RendererFactory = () => WebGLRenderer;

interface VillageScene3DProps {
  village: DerivedWorkspace;
  activity?: ActivitySnapshot;
  onSelect: (task: DerivedTask, trigger: HTMLButtonElement, project: DerivedProject) => void;
  onUnavailable?: () => void;
  rendererFactory?: RendererFactory;
}

const defaultRendererFactory: RendererFactory = () => new WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});

export function VillageScene3D({
  village,
  activity,
  onSelect,
  onUnavailable,
  rendererFactory = defaultRendererFactory,
}: VillageScene3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<SceneContent>();
  const rendererRef = useRef<WebGLRenderer>();
  const sceneRef = useRef<Scene>();
  const cameraRef = useRef<ReturnType<typeof createCameraController>>();
  const viewportRef = useRef({ width: 1, height: 1 });
  const taskRecordsRef = useRef(new Map<string, { task: DerivedTask; project: DerivedProject }>());
  const updateViewRef = useRef<() => void>(() => undefined);
  const onSelectRef = useRef(onSelect);
  const onUnavailableRef = useRef(onUnavailable);
  const [labelPositions, setLabelPositions] = useState<Record<string, CameraProjection>>({});
  const [cameraState, setCameraState] = useState({ zoom: 1, azimuth: 45, target: { x: 0, z: 0 } });
  const villageSignature = JSON.stringify(village);
  onSelectRef.current = onSelect;
  onUnavailableRef.current = onUnavailable;

  updateViewRef.current = () => {
    const content = contentRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const controller = cameraRef.current;
    if (!content || !renderer || !scene || !controller) return;
    renderer.render(scene, controller.camera);
    const viewport = viewportRef.current;
    const next: Record<string, CameraProjection> = {};
    for (const [taskId, anchor] of content.buildingAnchors) {
      next[taskId] = controller.project(anchor, viewport.width, viewport.height);
    }
    for (const district of content.layout.districts) {
      next[`project:${district.projectId}`] = controller.project(
        new Vector3(district.x, 0.45, district.z - district.depth / 2 + 1.5),
        viewport.width,
        viewport.height,
      );
    }
    setLabelPositions(next);
    const state = controller.getState();
    setCameraState({ zoom: state.zoom, azimuth: state.azimuth, target: state.target });
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: WebGLRenderer;
    try {
      renderer = rendererFactory();
    } catch {
      onUnavailableRef.current?.();
      return;
    }

    rendererRef.current = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.className = 'village-scene3d__canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.prepend(renderer.domElement);

    const scene = new Scene();
    scene.background = new Color(0x101713);
    scene.fog = new Fog(0x101713, 55, 110);
    scene.add(new AmbientLight(0xfff3dc, 1.7));
    const sunlight = new DirectionalLight(0xffe5b5, 3.4);
    sunlight.position.set(-24, 38, 18);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1024, 1024);
    scene.add(sunlight);
    sceneRef.current = scene;

    const controller = createCameraController(renderer.domElement, () => updateViewRef.current());
    cameraRef.current = controller;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(1, entry.contentRect.width);
      const height = Math.max(1, entry.contentRect.height);
      viewportRef.current = { width, height };
      renderer.setSize(width, height, false);
      controller.updateViewport(width, height);
      updateViewRef.current();
    });
    resizeObserver.observe(host);

    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const onCanvasClick = (event: MouseEvent) => {
      const content = contentRef.current;
      if (!content) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;
      pointer.set(
        (event.clientX - bounds.left) / bounds.width * 2 - 1,
        -(event.clientY - bounds.top) / bounds.height * 2 + 1,
      );
      raycaster.setFromCamera(pointer, controller.camera);
      const taskId = raycaster.intersectObject(content.root, true)
        .map(({ object }) => object.userData.taskId as string | undefined)
        .find(Boolean);
      if (!taskId) return;
      const record = taskRecordsRef.current.get(taskId);
      const escapedId = typeof CSS === 'undefined' ? taskId : CSS.escape(taskId);
      const trigger = host.querySelector<HTMLButtonElement>(`[data-scene-task-id="${escapedId}"]`);
      if (record && trigger) onSelectRef.current(record.task, trigger, record.project);
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      onUnavailableRef.current?.();
    };
    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.render(scene, controller.camera);

    return () => {
      renderer.domElement.removeEventListener('click', onCanvasClick);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      resizeObserver.disconnect();
      controller.dispose();
      const content = contentRef.current;
      if (content) scene.remove(content.root);
      renderer.dispose();
      renderer.domElement.remove();
      contentRef.current = undefined;
      rendererRef.current = undefined;
      sceneRef.current = undefined;
      cameraRef.current = undefined;
    };
  }, [rendererFactory]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const content = buildSceneContent(village);
    syncActivity(content, activity);
    const records = new Map<string, { task: DerivedTask; project: DerivedProject }>();
    for (const project of village.projects) {
      for (const task of [...project.features.flatMap((feature) => feature.tasks), ...project.tasks]) {
        records.set(task.id, { task, project });
      }
    }
    taskRecordsRef.current = records;
    contentRef.current = content;
    scene.add(content.root);
    updateViewRef.current();

    return () => {
      scene.remove(content.root);
      if (contentRef.current === content) contentRef.current = undefined;
    };
    // The signature avoids rebuilding the 3D world when polling returns identical data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [villageSignature]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    syncActivity(content, activity);
    updateViewRef.current();
  }, [activity]);

  const focusTask = (taskId: string, focused: boolean) => {
    const building = contentRef.current?.buildings.get(taskId);
    if (!building) return;
    building.scale.setScalar(focused ? 1.08 : 1);
    updateViewRef.current();
  };

  return (
    <section
      ref={hostRef}
      className="village-scene3d"
      data-testid="village-scene-3d"
      data-scene-ready="true"
      data-building-count={village.projects.reduce(
        (count, project) => count + project.tasks.length
          + project.features.reduce((sum, feature) => sum + feature.tasks.length, 0),
        0,
      )}
      data-worker-count={activity?.workers.length ?? 0}
      data-camera-zoom={cameraState.zoom.toFixed(3)}
      data-camera-azimuth={cameraState.azimuth}
      data-camera-target={`${cameraState.target.x.toFixed(3)}:${cameraState.target.z.toFixed(3)}`}
      aria-label={`${village.name} 3D village`}
    >
      <SceneLabels
        village={village}
        positions={labelPositions}
        onSelect={onSelect}
        onFocusTask={focusTask}
      />
      <button
        type="button"
        className="scene-reset"
        onClick={() => cameraRef.current?.reset()}
      >
        Reset 3D view
      </button>
    </section>
  );
}
