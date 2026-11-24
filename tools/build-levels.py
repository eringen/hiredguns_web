"""Stage the development levels and their original terrain graphics."""
import json
import re
import shutil
import struct
import subprocess
import zlib
from game_art import cut_sheet, cut_item_bobs, unpack_figure
from pathlib import Path
from mission_loading import build_briefings

root = Path("external/original/HiredGunsCD32_DevFiles")
out = Path("build/preview")
maps = out / "maps"
maps.mkdir(parents=True, exist_ok=True)
catalog = []
headers = {}
for source in sorted((root / "Maps/Game").glob("Map*/*.map")):
    ident = int(source.stem)
    header = source.read_bytes()[:542]
    headers[ident] = header
    installed = root / f'Test/HiredGunsCD32/Maps/{ident:02d}.map'
    mission = installed if installed.exists() else source
    data = mission.read_bytes()
    if len(data) != 157738:
        raise ValueError(f"Unsupported map length in {source}")
    directory = source.parent.name.split("_", 1)[1]
    group = "Development" if ident in (13, 16, 22, 24, 32, 36) else (
        "Campaign" if ident <= 21 else "Training" if ident >= 43 else "Action")
    label = f"{ident:02d} · {directory}"
    if group == "Training":
        label = f"Training Zone {ident - 42}"
    catalog.append(dict(id=ident, label=label, group=group, style=data[533],
                        x=int.from_bytes(header[:2], 'big')*2, y=int.from_bytes(header[2:4], 'big'),
                        hitWidth=2*int.from_bytes(header[4:6],"big"),hitHeight=int.from_bytes(header[6:8],"big"),
                        legend=[header[a:b].split(b"\0")[0].rstrip(b"~").decode("latin1") for a,b in [(16,61),(67,127),(133,193),(199,259)]],
                        picture=header[527], music=header[528], atmos=header[529], locationType=header[9], mission=header[526],
                        routes=[n for n in struct.unpack_from('>4H',header,534) if n]))
    shutil.copyfile(mission, maps / f"{ident}.map")
world = (root / 'Test/HiredGunsCD32/World/Locations.dat').read_bytes()
locations = b''.join(headers[n] for n in sorted(headers))
crc = 0
for byte in locations:
    crc ^= byte
    for _ in range(8):
        crc = (crc >> 1) ^ (0xa001 if crc & 1 else 0)
if (len(locations), crc) != (int.from_bytes(world[4:8],'big'), int.from_bytes(world[12:14],'big')):
    raise ValueError("Location headers differ from installed world")
(out / 'art').mkdir(exist_ok=True)
build_briefings(root, out/'art', headers)
subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(root/'Data/Death.dat/Death.ilbm'),
                '-frames:v','1',str(out/'art/death.png')],check=True)
subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(root/'Data/World.dat/Map4.ham8'),
                '-frames:v','1',str(out/'art/world.png')],check=True)
# Each view slot has eight possible combinations of up to four occluding slots.
source_tables = (root/'Sources/Tables.s').read_text('latin1').split('block_removal\tdc.w',1)[1].split('descan_north',1)[0]
words = re.findall(r'xxxx|([0-9]+)\*4', re.sub(r';[^\n]*','',source_tables))
if len(words) != 67*32:
    raise ValueError("Unexpected source occlusion table")
rules = []
for start in range(0,len(words),32):
    cases = []
    for offset in range(start,start+32,4):
        if not words[offset]:
            break
        cases.append([int(n) for n in words[offset:offset+4] if n])
    rules.append(cases)
(out/'visibility.json').write_text(json.dumps(rules))
for name in ['Fill','Rotations','HorizLine','VertLine','Foam','Exit','Rip','Claws','BigClaws','TooHeavy','NoRoom','Drowning','Poisoned','Invalid','Leader','LeaderOff','Icon1','Icon2','Icon3','Icon4','Locked','Locked2','Using','Planet','Skeleton']:
    shutil.copyfile(root/f'Graphics/Misc/Raw/{name}.bin',out/f'{name}.bin')
# Tables.s gives offsets into the ordered view for the three AGA light masks.
view_table=(root/'Sources/Tables.s').read_text('latin1').split('\nview_offsets',1)[1].split('\n\t\t\teven',1)[0]
neighbors=re.findall(r'dc\.l\s+(\d+),(-?\d+)\*4,(-?\d+)\*4,(-?\d+)\*4',view_table)
assert len(neighbors)==67
(out/'light-neighbors.json').write_text(json.dumps([list(map(int,row)) for row in neighbors]))
misc=(root/'Test/HiredGunsCD32/Game/Misc.gfx').read_bytes()
light_offsets=struct.unpack_from('>4I',misc,20*4)
for i in range(3):
    (out/f'Light{i+1}.bin').write_bytes(misc[light_offsets[i]:light_offsets[i+1]])
for style in {m["style"] for m in catalog}:
    src = root / "Graphics" / f"Style{style+1}"
    dest = out / "styles" / str(style)
    dest.mkdir(parents=True, exist_ok=True)
    layout=(src/'Ass'/f'Style{style+1}.s').read_text().split('mon1front\tds.b')[0]
    slots=re.findall(r'^\s*dc\.l\s+(\w+)(?:-start)?',layout,re.M|re.I)
    bank_data=(root/f'Test/HiredGunsCD32/Styles/Style{style:02d}.gfx').read_bytes()
    offsets=struct.unpack_from(f'>{len(slots)}I',bank_data)
    ends=sorted({*offsets,len(bank_data)})
    sheets={}
    bank=bytearray()
    for label,offset in dict(zip(slots,offsets)).items():
        if not offset or label.startswith(('mon1','mon2','monster')): continue
        sheet=bank_data[offset:ends[ends.index(offset)+1]]
        filename={'stone':'Stone.bin','grass':'Grass.bin','mapblocks':'MapBlocks.bin'}.get(label)
        if filename:
            (dest/filename).write_bytes(sheet)
        else:
            sheets[label]=[len(bank),len(sheet)]
            bank.extend(sheet)
    (dest / 'terrain.bin').write_bytes(bank)
    (dest / 'terrain.json').write_text(json.dumps(sheets))
    shutil.copyfile(src / "ILBM/Stone.ilbm", dest / "Stone.ilbm")
book=(root/'Sources/engtext').read_bytes()
for group,ids,phrases in [('Training',range(43,48),range(58,63)),('Action',[23,25,26,27,28,29,30,31,33,34,35,37,38,39,40,41,42],[36,37,38,39,42,43,44,45,47,48,49,50,52,53,54,55,56])]:
    for ident,phrase in zip(ids,phrases):
        offset=struct.unpack_from('>H',book,(phrase-1)*2)[0]
        name=book[offset:book.index(245,offset)].lstrip(b'\xfc').decode('latin1')
        next(m for m in catalog if m['id']==ident)['menuName']=name
for m in catalog:
    if 'menuName' not in m:
        legend=headers[m['id']][67:127].rstrip(b'~\0').decode('latin1')
        m['menuName']=legend if legend.startswith('LOG ENTRY') else m['label'].split(' · ')[-1]
(out / "levels.json").write_text(json.dumps(catalog, indent=2))

# Sizes, member offsets and one-based inventory IDs come from Sources/Equates.i.

item_data = (root / 'Data/GameFast.dat/Items.dat').read_bytes()
items = [None]
item_art=(root/'Test/HiredGunsCD32/Game/Items.gfx').read_bytes()
for offset in range(0, len(item_data), 286):
    record = item_data[offset:offset + 286]
    def title_line(start):
        return record[start + 2:start + 15].decode('latin1').replace('~', ' ').replace('\x7f', ' ').strip()
    items.append(dict(name=' '.join(filter(None, (title_line(0), title_line(16)))),
                      info=[record[n+2:n+18].decode('latin1').replace('~',' ').replace('\x7f',' ').strip() for n in range(64,254,19)],
                      labels=[title_line(n) for n in (0,16,32,48)],
                      description=' '.join(record[n+2:n+18].decode('latin1').replace('~',' ').replace('\x7f',' ').strip()
                                           for n in range(64,254,19)).strip().replace('- ', ''),
                      image=record[255], imageOffset=struct.unpack_from('>hh',item_art,22+14*record[255]), category=record[254], container=record[256],
                      core=record[274] if record[254]==22 else None, waterDamage=record[257], maxDamage=struct.unpack_from('>H',record,258)[0],
                      animColor=struct.unpack_from('>H',record,262)[0],animation=record[264],flash=record[266],accuracy=record[274],
                      sample=record[267], period=struct.unpack_from('>H',record,268)[0],
                      grenade=dict(fire=list(record[274:280]),radius=struct.unpack_from('>H',record,280)[0],
                                   type=record[282]) if record[254] in (21,4) else None,
                      fireDirections=list(record[275:281]), fitnessBoost=struct.unpack_from('>H',record,274)[0], burst=record[265], damagePerHit=record[285],
                      clips=list(record[281:284]), capacity=record[284],
                      weight=struct.unpack_from('>H', record, 260)[0]))
characters = []
character_data = (root / 'Sources/Data/characters').read_bytes()
for offset in range(0, 12 * 272, 272):
    record = character_data[offset:offset + 272]
    def loadout(start):
        return [dict(id=i, damage=d, ammo=a) for i,d,a,_ in
                struct.iter_unpack('4B', record[start:start + 40]) if i]
    ident = offset // 272
    filename = record[149:177].split(b'\0')[0].decode('ascii')
    figure = unpack_figure((root / 'Test/HiredGunsCD32' / filename).read_bytes())
    if len(figure) != 14224 + 1126:
        raise ValueError(f'Unexpected figure size for {filename}')
    (out / f'figure{ident}.bin').write_bytes(figure)
    profile = [record[n:n+33].split(b'\0')[0].decode('ascii') for n in range(0,132,33)]
    characters.append(dict(id=ident, profile=profile, name=record[132:149].split(b'\0')[0].decode('ascii'),
                           gender=record[177], race=record[178], fitness=struct.unpack_from('>H', record, 180)[0],
                           agility=struct.unpack_from('>H', record, 184)[0],
                           experience=struct.unpack_from('>H', record, 186)[0],
                           physique=struct.unpack_from('>H', record, 182)[0],
                           stepPeriod=struct.unpack_from('>H', record, 188)[0],
                           pack=loadout(192)))
monster_data = (root/'Data/GameFast.dat/Monsters.dat').read_bytes()
monster_fields = ('physique','weaponModifier','speed','fireballDensity','poison','range','graphics','twoHigh',
                  'waterOnly','padding','bravery','sample','period','projectileSpeed','decay','outline','stun')
monsters = [dict(zip(monster_fields,row)) for row in struct.iter_unpack('>HHb7B3H4B',monster_data)]
tables=(root/'Sources/Tables.s').read_text('latin1').split('\naudio_dist\n',1)[1]
rows=re.findall(r'^\s*dc\.b\s+([\d,]+)',tables,re.M)[:144]
audio_distance=[int(v) for row in rows for v in row.split(',')]
assert len(audio_distance)==12**3
(out / 'equipment.json').write_text(json.dumps(dict(items=items, characters=characters, monsters=monsters,audioDistance=audio_distance)))
shutil.copyfile(root/'Data/GameFast.dat/Grenade.bin',out/'Grenade.bin')
shutil.copyfile(root/'Data/GameChip.dat/FireEffectsCD32.hws',out/'fire-effects.bin')
shutil.copyfile(root/'Audio/ExtraEffects/Lift.8svx',out/'Lift.8svx')
sky_source=(root/'Sources/Sky.s').read_text(encoding='latin1')
sky_tables={}
sections=re.split(r'^(nosky|nosky_planet|scotch_mist)$',sky_source,flags=re.M)
for label,body in zip(sections[1::2],sections[2::2]):
    rows=[]
    for line in re.findall(r'^\s*SKY[ \t]+([^\n;]+)',body,re.M):
        channels=[sum(int(term[1:],16) if term.startswith('$') else int(term) for term in n.strip().split('+')) for n in line.split(',')]
        rows.append([min(255,channels[i]+channels[i+3]) for i in range(3)])
    sky_tables[label]=rows
(out/'sky.json').write_text(json.dumps(sky_tables))
audio = out/'atmos'
audio.mkdir(exist_ok=True)
for source in (root/'Test/HiredGunsCD32/Atmos').glob('*.sfx'):
    shutil.copyfile(source,audio/source.name)
messages = (root/'Data/GameFast.dat/Messages.dat').read_bytes()
def message(offset):
    return messages[offset+8:messages.index(0,offset+8)].decode('latin1')
banks = []
for bank in range(25):
    count, start = struct.unpack_from('>HH',messages,bank*4)
    banks.append([message(struct.unpack_from('>H',messages,start+2*i)[0]) for i in range(count)])
(out/'chatter.json').write_text(json.dumps(dict(banks=banks,armed=message(struct.unpack_from('>H',messages,100)[0]))))
for source in (root/'Test/HiredGunsCD32/MonstersGfx').glob('Monster*.gfx'):
    figure=unpack_figure(source.read_bytes())
    if len(figure)!=19302:
        raise ValueError(f'Unexpected monster figure {source}')
    (out/f'{source.stem}.bin').write_bytes(figure)
extras='Bark Bat Grumble Drip DTS EchoScream FemaleGrunt Gun Lift MaleGrunt MetalClang Roar Swipe Swish Voice Thunder Unlock'.split()
for name in ['Footstep','Bump','GunReload','NewGun1','NewGun2','GunEmpty','EggHatch','Explosion','LaserCrack','Arc','Cast','DoorOpening','DoorClosed','BlockSlide','Button','Teleport',*extras]:
    sample_dir='Audio/ExtraEffects' if name in extras else 'Audio/Effects'
    sample = (root / sample_dir / (name + '.8svx')).read_bytes()
    if name=='DoorOpening':
        (out/'DoorOpening.8svx').write_bytes(sample)
    pos = 12
    while pos + 8 <= len(sample):
        size = int.from_bytes(sample[pos+4:pos+8], 'big')
        if sample[pos:pos+4] == b'BODY':
            (out / (name + '.pcm')).write_bytes(sample[pos+8:pos+8+size])
            break
        pos += 8 + size + (size & 1)
    else:
        raise ValueError(f'Missing sample body in {name}')
art=(root/'Graphics/Misc/ILBM/Expl1_64.ilbm').read_bytes()
cmap=art.index(b'CMAP')+8
(out/'explosion-palette.bin').write_bytes(art[cmap:cmap+192])
main=(root/'Sources/Main.s').read_text('latin1')
words=re.findall(r'\$([0-9a-fA-F]{3})',main.split('\ngame_palette\t',1)[1])[:32]
copper=(root/'Sources/CopperLists/GameCD32.s').read_text('latin1')
for index,value in re.findall(r'C_MOVE\s+color(\d+),\$([a-f0-9]+)',copper.split('\ncol_wait1\n')[1].split('\ncol_waits1')[0]):
    words[int(index)]=value
# The first viewport scanline switches the submerged pickup highlight (pen 29)
# from the HUD's white to the playfield's brown.
words[29]=re.search(r'C_MOVE\s+color29,\$([a-f0-9]+)',copper.split('\ncol_waits1\n')[1])[1]
# The compiled AGA copper list contains both nibbles of the illuminated bank.
game_copper=(root/'Test/HiredGunsCD32/Game/Game.cpr').read_bytes()
lit=bytearray()
for i in range(32):
    hi_reg,hi=struct.unpack_from('>HH',game_copper,8+4*i)
    lo_reg,lo=struct.unpack_from('>HH',game_copper,140+4*i)
    assert hi_reg==lo_reg==0x180+2*i
    for shift in (8,4,0):
        lit.append(((hi>>shift&15)<<4)|(lo>>shift&15))
(out/'view-palette.bin').write_bytes(bytes(int(n,16)*17 for word in words for n in word)+lit)
for n in range(1,5):
    shutil.copyfile(root/f'Graphics/Misc/Raw/expl{n}.bin',out/f'expl{n}.bin')
    shutil.copyfile(root/f'Graphics/Misc/Raw/Water{n}.bin',out/f'Water{n}.bin')

ch=root/'Data/ChSelect.dat'
select_source=(root/'Sources/ChSelect.s').read_text('latin1')
def face_palette(label,count):
    words=re.findall(r'\$([0-9a-f]{3})',select_source.split('\n'+label+'\n',1)[1])[:count]
    return bytes(int(digit,16)*17 for word in words for digit in word)
rectangles=[tuple(map(int,line[2:].split(','))) for line in (ch/'SmallFaces.script').read_text().splitlines() if line.startswith('-f')]
# ChSelect.s indexes these slots from one. Slot zero is the empty squad frame.
cut_sheet(ch/'SmallFacesCD32.ilbm',rectangles[1:],out/'art','portrait',palette=face_palette('chselect2_palette',8))
cut_sheet(ch/'SmallFacesCD32.ilbm',rectangles[:1],out/'art','empty-face',palette=face_palette('chselect2_palette',8))
cut_sheet(root/'Data/Front.dat/Fill2.ilbm',[(0,0,640,42)],out/'art','roster-rock',palette=face_palette('chselect2_palette',16)[24:48])
cut_sheet(ch/'FacesCD32.ilbm',[(0,0,2624,226)],out/'art','face-strip',palette=face_palette('chselect_palette',16))
cut_sheet(ch/'FacesCD32.ilbm',[(0,0,2624,226)],out/'art','face-strip-dim',palette=face_palette('chselect_palette',32)[48:])
cut_sheet(root/'Data/World.dat/Panel.ilbm',[(0,0,640,51)],out/'art','map-panel',palette=bytes.fromhex('000000 ffffff aaaaaa 666666 000000 000000 000000 000000 000000 ccddff 7799bb 223366 113344 002233 001122 001111'))
cut_sheet(root/'Data/World.dat/Sprites.ilbm',[(0,0,16,333)],out/'art','map-cross',b'\x00',bytes.fromhex('000000 ff3333 ff6666 550000'))
shutil.copyfile(root/'Data/World.dat/World.font',out/'world-font.bin')
cut_sheet(root/'Data/World.dat/Sprites.ilbm',[(16,0,16,160)],out/'art','map-flag',b'\x00',bytes.fromhex('000000 ff2222 22ff22 000000'))
for filename,source in [('menu-font.bin',root/'Test/HiredGunsCD32/Front/Mesg.dat'),('menu-title.bin',root/'Data/Front.dat/FrontB.font')]:
    shutil.copyfile(source,out/filename)
cut_item_bobs(root/'Test/HiredGunsCD32/Game/Items.gfx',root/'Graphics/Misc/ILBM/ItemsCD32.ilbm',out/'art')
from front_screen import build_front
build_front(root, out / 'art')

cut_sheet(root / 'Data/GameFast.dat/Windows.ilbm',
          [(0,0,160,103),(160,0,160,103),(0,109,160,103),(160,109,160,103)],
          out / 'art','window', bytes(0 if i in (6,22) else 255 for i in range(23)))
shutil.copyfile(root / 'Graphics/Misc/Raw/GameFont.bin',out / 'hud-font.bin')

for direction in 'nesw':
    shutil.copyfile(root / f'Graphics/Misc/Raw/Compass_{direction}.bin',out / f'compass-{direction}.bin')

controls=(root/'Sources/ColdStartup.s').read_text('latin1')
zones={}
for match in re.finditer(r'^win(\w+_gadgets\w*)[ \t]*(?:\n[ \t]*)?dc\.w',controls,re.M):
    body=controls[match.start():].split(';eod',1)[0]
    zones[match[1]]=[list(map(int,row.split(','))) for row in re.findall(r'dc\.w\s+([\d,]+)',body)]
(out/'mouse.json').write_text(json.dumps(zones))
cut_sheet(root/'Data/GameChip.dat/Sprites.ilbm',[(0,16*i,32,16) for i in range(19)],out/'art','mouse',b'\x00')

# Final entry in Windows.gfx is the 80x79 item-information overlay (five planes).
window_data=(root/'Data/GameFast.dat/Windows.gfx').read_bytes()
info_offset=struct.unpack_from('>I',window_data,20)[0]
(out/'info-panel.bin').write_bytes(window_data[info_offset+18:])

window_sheet=(root/'Data/GameFast.dat/Windows.ilbm').read_bytes()
cmap=window_sheet.index(b'CMAP')+8
(out/'window-palette.bin').write_bytes(window_sheet[cmap:cmap+int.from_bytes(window_sheet[cmap-4:cmap],'big')])
# Store the item-information panel as an indexed PNG.
info = window_data[info_offset+18:]
colors = window_sheet[cmap:cmap+int.from_bytes(window_sheet[cmap-4:cmap], 'big')]
rows = bytearray()
for y in range(79):
    rows.append(0)
    for x in range(80):
        pixel = y * 80 + x
        rows.append(sum(((info[790 * plane + pixel // 8] >> (7 - pixel % 8)) & 1) << plane
                        for plane in range(5)))
def png_chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
(out/'art/info-panel.png').write_bytes(
    b'\x89PNG\r\n\x1a\n' +
    png_chunk(b'IHDR', struct.pack('>IIBBBBB', 80, 79, 8, 3, 0, 0, 0)) +
    png_chunk(b'PLTE', colors) + png_chunk(b'IDAT', zlib.compress(rows)) + png_chunk(b'IEND', b''))

# Convert static HUD sprites into transparent PNGs during the build.
view_colors = (out/'view-palette.bin').read_bytes()
for name in ['Icon1', 'Icon2', 'Icon3', 'Icon4', 'Locked', 'Locked2', 'Using',
             'TooHeavy', 'NoRoom', 'Drowning', 'Poisoned', 'Invalid']:
    data = (out / (name + '.bin')).read_bytes()
    width, height = struct.unpack_from('>HH', data, 18)
    start = struct.unpack_from('>I', data, 28)[0]
    planes = 5 if name.startswith('Icon') else 4
    masked = not name.startswith('Icon') and data[9] == 4
    stride = width * height // 8
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            pixel = y * width + x
            pos, bit = start + pixel // 8, 7 - pixel % 8
            index = sum(((data[pos + plane * stride] >> bit) & 1) << plane for plane in range(planes))
            opaque = not masked or bool(data[pos + planes * stride] & (1 << bit))
            rows.extend(view_colors[index*3:index*3+3])
            rows.append(255 if opaque else 0)
    (out/'art'/('hud-'+name+'.png')).write_bytes(
        b'\x89PNG\r\n\x1a\n' +
        png_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) +
        png_chunk(b'IDAT', zlib.compress(rows)) + png_chunk(b'IEND', b''))
