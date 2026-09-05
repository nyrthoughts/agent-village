import type { ReactNode } from 'react';
import { CONSTRUCTION_STAGES, type ConstructionStage } from '../../shared/statuses.js';
import type { BuildingArchitecture, BuildingFamily } from './buildingFamilies.js';

export type BuildingStage = ConstructionStage | 'survey';

// Original pixel drawings: integer coordinates, one light direction, no remote assets.
// Artwork may extend above the tile, but the walkable footprint stays 7 × 6 tiles.
const SHAPES: Record<BuildingArchitecture, { foundation: string; frame: string; roof: string }> = {
  japanese_workshop: {
    foundation: 'M13 79H99V115H13Z',
    frame: 'M19 111V68H93V111M19 87H93M39 68V111M72 68V111M19 68L35 43H79L93 68M35 43V68M79 43V68',
    roof: 'M3 77V69H9V66H15V59H21V51H27V43H33V36H79V43H85V51H91V59H97V66H103V69H109V77Z',
  },
  moroccan_courtyard: {
    foundation: 'M13 70H99V116H13Z',
    frame: 'M18 111V49H94V111M18 68H94M37 49V111M75 49V111M18 90H37M75 90H94M37 111V99H75V111',
    roof: 'M11 42H101V100H73V69H39V100H11Z',
  },
  dutch_gable: {
    foundation: 'M29 72H83V116H29Z',
    frame: 'M33 112V45H79V112M33 76H79M33 97H79M56 17V112M33 45L56 17L79 45',
    roof: 'M27 56V42H33V30H40V18H48V9H64V18H72V30H79V42H85V56Z',
  },
  brazilian_sobrado: {
    foundation: 'M17 69H97V116H17Z',
    frame: 'M23 112V46H91V112M23 78H91M45 46V112M70 46V112M23 46L35 29H79L91 46M15 80H101M18 80V98M98 80V98',
    roof: 'M10 56V47H16V40H22V32H28V23H86V32H92V40H98V47H104V56Z',
  },
  greek_terraces: {
    foundation: 'M13 72H99V116H13Z',
    frame: 'M18 112V39H46V112M18 71H46M46 58H74V112M46 86H74M74 82H95V112M18 96H95',
    roof: 'M12 35H49V53H77V77H101V90H70V66H43V48H12Z',
  },
  norwegian_storehouse: {
    foundation: 'M23 86H91V112H23Z',
    frame: 'M29 112V58H85V112M29 95H85M29 73H85M47 58V95M67 58V95M29 58L56 24L85 58',
    roof: 'M11 73V65H17V57H23V48H29V39H35V30H43V21H50V15H62V21H69V30H77V39H83V48H89V57H95V65H101V73Z',
  },
};

function Window({ x, y, w = 12, h = 16, trim }: { x: number; y: number; w?: number; h?: number; trim: string }) {
  return <g>
    <path fill={trim} d={`M${x} ${y}h${w}v${h}h-${w}z`} />
    <path fill="#426c70" d={`M${x + 3} ${y + 3}h${w - 6}v${h - 6}h-${w - 6}z`} />
    <path fill="#bad8c0" d={`M${x + 3} ${y + 3}h${w - 6}v3h-${w - 6}z`} />
  </g>;
}

function Door({ x = 48, y = 88, w = 16, h = 24, trim }: { x?: number; y?: number; w?: number; h?: number; trim: string }) {
  return <g>
    <path fill={trim} d={`M${x} ${y}h${w}v${h}h-${w}z`} />
    <path fill="#4c5140" d={`M${x + 3} ${y + 3}h${w - 6}v${h - 3}h-${w - 6}z`} />
    <path fill="#b28b56" d={`M${x + 3} ${y + 3}h4v${h - 3}h-4z`} />
    <path fill="#ecd796" d={`M${x + w - 6} ${y + h / 2}h2v3h-2z`} />
  </g>;
}

function Architecture({ family: f, layer }: { family: BuildingFamily; layer: 'walls' | 'roof' | 'finish' }): ReactNode {
  const { wallColor: wall, wallLight: light, wallDark: shade, trimColor: trim, roofColor: roof, roofLight: roofLight, roofDark: roofDark } = f;
  if (layer === 'roof') return <g>
    <path data-architecture-outline={f.id} fill={roofDark} d={SHAPES[f.id].roof} />
    {f.id === 'japanese_workshop' && <>
      <path fill={roof} d="M9 71h94v3H9zM19 63h74v5H19zM25 55h62v5H25zM31 47h50v5H31zM37 39h38v5H37z" />
      <path fill={roofLight} d="M33 36h46v3H33zM29 48h54v2H29zM23 56h66v2H23zM17 64h78v2H17zM3 69h6v3H3zM103 69h6v3h-6z" />
      <path fill={roofDark} d="M46 44h2v4h-2zM65 52h2v4h-2zM38 60h2v4h-2zM79 60h2v4h-2zM21 68h2v3h-2zM53 68h2v3h-2zM85 68h2v3h-2z" />
      <path fill={trim} d="M11 77h90v4H11z" />
    </>}
    {f.id === 'moroccan_courtyard' && <>
      <path fill={roof} d="M15 46h82v17H15zM15 63h20v33H15zM77 63h20v33H77z" />
      <path fill={roofLight} d="M11 42h90v4H11zM11 46h4v50h-4zM35 65h42v4H35zM73 69h4v31h-4zM11 96h28v4H11zM73 96h28v4H73z" />
      <path fill={shade} d="M20 51h72v3H20zM20 56h3v33h-3zM84 59h8v3h-8zM88 72h4v17h-4z" />
      <path fill={trim} d="M19 33h11v10H19zM83 33h11v10H83z" /><path fill={light} d="M21 32h7v7h-7zM85 32h7v7h-7z" />
    </>}
    {f.id === 'dutch_gable' && <>
      <path fill={roof} d="M31 51v-6h6V33h7V21h8v-8h8v8h8v12h7v12h6v6z" />
      <path fill={trim} d="M27 52h58v4H27zM33 42h7v3h-7zM40 30h8v3h-8zM48 18h16v3H48zM48 9h16v3H48zM64 30h8v3h-8zM72 42h7v3h-7z" />
      <Window x={50} y={31} w={12} h={17} trim={trim} />
      <path fill={roofLight} d="M40 47h5v2h-5zM68 37h4v2h-4zM45 24h4v2h-4z" />
    </>}
    {f.id === 'brazilian_sobrado' && <>
      <path fill={roof} d="M16 49h82v4H16zM22 42h70v4H22zM28 34h58v5H28zM32 27h50v4H32z" />
      <path fill={roofLight} d="M28 23h58v4H28zM28 33h58v2H28zM22 41h70v2H22zM16 48h82v2H16zM10 53h94v3H10z" />
      <path fill={roofDark} d="M39 28h2v5h-2zM64 28h2v5h-2zM32 36h2v5h-2zM56 36h2v5h-2zM79 36h2v5h-2zM24 44h2v4h-2zM45 44h2v4h-2zM68 44h2v4h-2zM91 44h2v4h-2z" />
    </>}
    {f.id === 'greek_terraces' && <>
      <path fill={roof} d="M16 39h29v5H16zM47 57h26v5H47zM74 81h23v5H74z" />
      <path fill={roofLight} d="M12 35h37v4H12zM12 39h4v9h-4zM43 53h34v4H43zM43 57h4v9h-4zM70 77h31v4H70zM70 81h4v9h-4z" />
      <path fill={trim} d="M22 30h17v5H22zM26 26h9v4h-9z" /><path fill="#89b9c0" d="M26 27h7v3h-7z" />
    </>}
    {f.id === 'norwegian_storehouse' && <>
      <path fill={roof} d="M17 66h78v4H17zM23 58h66v5H23zM29 49h54v6H29zM35 40h42v6H35zM43 31h26v6H43zM50 22h12v6H50z" />
      <path fill={roofLight} d="M50 17h12v5H50zM43 29h10v3H43zM58 38h15v3H58zM32 47h10v3H32zM74 56h12v3H74zM21 63h13v3H21zM43 56h7v3h-7zM61 64h10v3H61z" />
      <path fill={trim} d="M11 71h90v4H11zM47 12h6v6h-6zM60 12h6v6h-6z" />
      <path fill={light} d="M18 69h76v2H18z" />
    </>}
  </g>;

  if (f.id === 'japanese_workshop') return layer === 'walls' ? <g>
    <path fill={trim} d="M16 78h80v34H16z" /><path fill={wall} d="M20 81h72v27H20z" />
    <path fill={shade} d="M86 81h6v27h-6z" /><path fill={light} d="M20 81h3v27h-3z" />
    <path fill={trim} d="M37 81h4v27h-4zM70 81h4v27h-4zM20 103h72v3H20z" />
    <path fill="#504c3a" d="M47 86h19v26H47zM23 86h11v14H23zM77 86h11v14H77z" />
    <path fill={shade} d="M11 109h90v7H11z" /><path fill={light} d="M11 109h90v3H11z" />
  </g> : <g>
    <Window x={23} y={85} w={12} h={18} trim={trim} /><Window x={77} y={85} w={12} h={18} trim={trim} />
    <path fill={light} d="M26 91h6v2h-6zM80 91h6v2h-6zM28 88h2v12h-2zM82 88h2v12h-2z" />
    <Door x={45} y={83} w={23} h={28} trim={trim} />
    <path fill="#638f8a" d="M44 81h25v11H44z" /><path fill="#d5ddb3" d="M54 83h5v5h-5z" /><path fill={trim} d="M56 81h2v11h-2z" />
    <path fill="#b7784d" d="M5 100h9v10H5zM98 100h9v10h-9z" /><path fill="#e5c47e" d="M5 98h9v4H5zM98 98h9v4h-9z" />
  </g>;

  if (f.id === 'moroccan_courtyard') return layer === 'walls' ? <g>
    <path fill={trim} d="M15 62h82v52H74V79H38v35H15z" /><path fill={wall} d="M18 65h76v14H18zM18 79h17v32H18zM77 79h17v32H77z" />
    <path fill={shade} d="M30 79h5v32h-5zM89 79h5v32h-5zM38 76h36v4H38z" />
    <path fill={light} d="M18 67h3v43h-3zM77 80h3v30h-3z" />
    <path fill={wall} d="M35 97h42v17H35z" /><path fill={trim} d="M47 114V99h3v-4h12v4h3v15z" />
    <path fill={light} d="M35 94h12v5H35zM65 94h12v5H65zM47 92h18v4H47z" />
  </g> : <g>
    <path fill="#568e92" d="M44 82h24v10H44z" /><path fill="#96c9bd" d="M48 84h16v5H48z" /><path fill={light} d="M53 80h6v8h-6z" />
    <path fill="#9c7147" d="M50 101h12v13H50z" /><path fill="#d4b26d" d="M52 102h2v12h-2zM59 105h2v3h-2z" />
    <path fill={trim} d="M23 100h7v7h-7zM82 100h7v7h-7z" /><path fill="#65a0a1" d="M24 101h5v4h-5zM83 101h5v4h-5z" />
    <path fill="#55864f" d="M38 81h5v9h-5zM68 82h5v8h-5z" /><path fill="#d6997b" d="M38 78h5v4h-5zM68 79h5v4h-5z" />
  </g>;

  if (f.id === 'dutch_gable') return layer === 'walls' ? <g>
    <path fill="#6b4c3c" d="M30 53h52v61H30z" /><path fill={wall} d="M33 55h46v57H33z" />
    <path fill={light} d="M33 55h4v57h-4z" /><path fill={shade} d="M74 55h5v57h-5z" />
    <path fill={trim} d="M30 77h52v4H30zM30 108h16v4H30zM66 108h16v4H66z" />
    <path fill="#4e5546" d="M39 60h12v15H39zM61 60h12v15H61zM48 89h16v23H48z" />
    <path fill={shade} d="M54 59h6v2h-6zM35 85h6v2h-6zM68 93h6v2h-6zM38 101h6v2h-6zM65 84h6v2h-6z" />
  </g> : <g>
    <Window x={38} y={59} w={14} h={18} trim={trim} /><Window x={60} y={59} w={14} h={18} trim={trim} />
    <Window x={36} y={89} w={10} h={16} trim={trim} /><Window x={67} y={89} w={10} h={16} trim={trim} />
    <Door y={87} w={16} h={26} trim={trim} />
    <path fill="#536d45" d="M36 105h10v4H36zM67 105h10v4H67z" /><path fill="#e7b275" d="M37 103h3v3h-3zM71 103h3v3h-3z" />
    <path fill="#776753" d="M43 113h26v4H43z" /><path fill="#d8c6a1" d="M43 113h26v2H43z" />
  </g>;

  if (f.id === 'brazilian_sobrado') return layer === 'walls' ? <g>
    <path fill="#49645a" d="M20 54h74v59H20z" /><path fill={wall} d="M24 57h66v54H24z" />
    <path fill={light} d="M24 57h4v54h-4z" /><path fill={shade} d="M84 57h6v54h-6z" />
    <path fill="#3d5e56" d="M31 61h14v20H31zM51 60h14v22H51zM72 61h12v20H72zM47 91h19v21H47zM28 94h12v14H28zM74 94h12v14H74z" />
    <path fill={trim} d="M12 80h90v7H12zM23 87h4v25h-4zM88 87h4v25h-4z" /><path fill={shade} d="M12 86h90v3H12z" />
  </g> : <g>
    <Window x={30} y={59} w={16} h={22} trim={trim} /><Window x={49} y={58} w={18} h={23} trim={trim} /><Window x={71} y={59} w={14} h={22} trim={trim} />
    <path fill={shade} d="M27 61h3v16h-3zM46 61h3v16h-3zM68 61h3v16h-3zM85 61h3v16h-3z" />
    <path fill="#647461" d="M14 72h86v3H14zM16 75h3v7h-3zM25 75h3v7h-3zM34 75h3v7h-3zM43 75h3v7h-3zM52 75h3v7h-3zM61 75h3v7h-3zM70 75h3v7h-3zM79 75h3v7h-3zM88 75h3v7h-3zM97 75h3v7h-3z" />
    <path fill={trim} d="M12 71h90v2H12zM12 82h90v2H12z" />
    <Door x={46} y={90} w={21} h={23} trim={trim} /><Window x={28} y={93} w={12} h={16} trim={trim} /><Window x={74} y={93} w={12} h={16} trim={trim} />
    <path fill="#578f59" d="M16 78h13v5H16zM84 78h13v5H84z" /><path fill="#eab391" d="M19 76h4v4h-4zM88 76h4v4h-4z" />
  </g>;

  if (f.id === 'greek_terraces') return layer === 'walls' ? <g>
    <path fill={shade} d="M15 46h33v67H15zM44 64h32v49H44zM72 88h26v25H72z" />
    <path fill={wall} d="M18 47h23v63H18zM47 65h23v45H47zM75 89h17v21H75z" />
    <path fill={light} d="M18 48h4v61h-4zM47 66h4v43h-4zM75 90h4v19h-4z" />
    <path fill="#496875" d="M26 61h11v17H26zM52 87h14v26H52zM79 94h9v12h-9z" />
    <path fill={light} d="M82 68h5v4h-5zM85 72h6v5h-6zM88 77h6v5h-6zM91 82h7v5h-7zM94 87h7v5h-7zM97 92h6v5h-6z" />
  </g> : <g>
    <Window x={25} y={60} w={13} h={20} trim={trim} /><Window x={78} y={93} w={11} h={15} trim={trim} />
    <Door x={51} y={85} w={17} h={28} trim={trim} />
    <path fill={trim} d="M20 58h4v24h-4zM39 58h4v24h-4zM17 81h29v3H17z" />
    <path fill="#758d54" d="M11 98h8v14h-8zM13 94h7v8h-7z" /><path fill="#cf9a98" d="M10 99h5v4h-5zM15 94h5v4h-5z" />
    <path fill="#c08258" d="M80 108h10v6H80z" /><path fill="#81a467" d="M80 103h10v7H80z" />
  </g>;

  return layer === 'walls' ? <g>
    <path fill={trim} d="M27 88h8v25h-8zM79 88h8v25h-8zM23 72h68v26H23z" />
    <path fill={wall} d="M27 75h60v20H27z" /><path fill={light} d="M27 76h3v18h-3z" /><path fill={shade} d="M80 75h7v20h-7z" />
    <path fill={trim} d="M27 81h60v2H27zM27 90h60v2H27zM48 77h18v21H48zM20 94h74v6H20z" />
    <path fill={light} d="M20 94h74v2H20zM31 99h4v11h-4zM83 99h4v11h-4z" />
    <path fill="#75634b" d="M45 100h24v5H45zM42 105h30v5H42zM39 110h36v6H39z" />
    <path fill="#c6a276" d="M45 100h24v2H45zM42 105h30v2H42zM39 110h36v2H39z" />
  </g> : <g>
    <Door x={47} y={76} w={20} h={22} trim={light} />
    <Window x={30} y={77} w={12} h={13} trim={trim} /><Window x={73} y={77} w={12} h={13} trim={trim} />
    <path fill={light} d="M25 74h3v18h-3zM86 74h3v18h-3zM34 92h8v2h-8zM73 92h8v2h-8z" />
    <path fill="#876b48" d="M85 105h15v10H85z" /><path fill="#c19a65" d="M85 105h15v3H85zM88 109h3v4h-3zM94 109h3v4h-3z" />
  </g>;
}

export function BuildingArtwork({ family, stage }: { family: BuildingFamily; stage: BuildingStage }) {
  const index = stage === 'survey' ? -1 : CONSTRUCTION_STAGES.indexOf(stage);
  const shapes = SHAPES[family.id];
  return <svg className="traveler-building__art" viewBox="0 0 112 128" shapeRendering="crispEdges" aria-hidden="true">
    <path fill="#304e38" opacity=".24" d="M14 108h84v5h10v7H22v-4h-8z" />
    {index <= 0 && <g data-building-layer={stage}>
      <path fill="#bba06e" opacity=".65" d={shapes.foundation} />
      <path fill="none" stroke="#ede2ac" strokeWidth="2" strokeDasharray="5 4" d={shapes.foundation} />
      <path fill="#826144" d="M14 75h4v13h-4zM94 75h4v13h-4zM14 106h4v13h-4zM94 106h4v13h-4z" />
      <path fill="#f1d996" d="M14 74h4v4h-4zM94 74h4v4h-4zM14 105h4v4h-4zM94 105h4v4h-4z" />
      {stage === 'survey' ? <>
        <path fill="none" stroke="#426b60" strokeWidth="2" strokeDasharray="4 5" opacity=".38" d={shapes.roof} />
        <path fill="#6e573e" d="M50 93h5v21h-5zM38 79h31v22H38z" /><path fill="#efe6bc" d="M41 82h25v16H41z" />
        <path fill="#5b8276" d="M47 87h13v3h-13zM47 93h8v2h-8zM62 91h2v5h-2z" />
      </> : <>
        <path fill="#647f70" d="M39 87h32v21H39z" /><path fill="#d2dcc0" d="M43 90h23v2H43zM43 90h2v14h-2zM43 102h23v2H43zM64 90h2v14h-2zM51 92h2v10h-2z" />
        <path fill="#c4a66d" d="M74 103h18v6H74zM77 98h15v5H77z" />
      </>}
    </g>}
    {index >= 1 && <g data-building-layer="foundation">
      <path fill="#786f56" d={shapes.foundation} />
      <path fill="none" stroke="#d6c398" strokeWidth="4" d={shapes.foundation} />
      <path fill="#b2a083" d="M40 106h31v7H40z" />
      {index === 1 && <path fill="#d3c19b" d="M24 84h19v3H24zM48 84h17v3H48zM71 84h17v3H71zM24 94h28v3H24zM57 94h31v3H57zM24 104h11v3H24zM77 104h11v3H77z" />}
    </g>}
    {index === 2 && <g data-building-layer="frame" fill="none" strokeLinecap="square" strokeLinejoin="miter">
      <path stroke="#73523b" strokeWidth="5" d={shapes.frame} />
      <path stroke="#d7ac71" strokeWidth="2" d={shapes.frame} />
    </g>}
    {index >= 3 && <g data-building-layer="walls"><Architecture family={family} layer="walls" /></g>}
    {index >= 4 && <g data-building-layer="roof"><Architecture family={family} layer="roof" /></g>}
    {index === 5 && <g data-building-layer="finish"><Architecture family={family} layer="finish" /></g>}
    {index >= 1 && index < 5 && <g data-building-layer="materials">
      <path fill="#926748" d="M4 105h20v5H4zM7 99h17v5H7zM85 112h18v5H85z" />
      <path fill="#d6af75" d="M4 105h20v2H4zM7 99h17v2H7zM85 112h18v2H85z" />
      <path fill="#847f66" d="M87 104h11v7H87z" /><path fill="#d9c392" d="M87 102h11v3H87z" />
    </g>}
  </svg>;
}
