import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
S=sys.argv[1]
W,H=2048,1152
bg=(20,21,23)
img=Image.new('RGB',(W,H),bg)
# soft red glow behind icon
glow=Image.new('L',(W,H),0); g=ImageDraw.Draw(glow); g.ellipse((420,380,900,780),fill=90)
glow=glow.filter(ImageFilter.GaussianBlur(120))
img=Image.composite(Image.new('RGB',(W,H),(120,24,20)),img,glow)
icon=Image.open('/home/claude/OVERLOAD-PLUS/icon-1024.png').convert('RGB').resize((310,310),Image.LANCZOS)
m=Image.new('L',icon.size,0); ImageDraw.Draw(m).rounded_rectangle((0,0,309,309),radius=68,fill=255)
img.paste(icon,(470,421),m)
d=ImageDraw.Draw(img)
b800=ImageFont.truetype(S+'/barlow800.ttf',180)
jp=ImageFont.truetype('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',60)
jps=ImageFont.truetype('/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',40)
x=840
d.text((x,405),'KURABELL',font=b800,fill=(245,245,245))
d.text((x,602),'伸びが見える筋トレ記録',font=jp,fill=(235,235,235))
d.rectangle((x,684,x+8,724),fill=(230,57,43))
d.text((x+26,684),'筋トレの疑問に、研究の数字で答える',font=jps,fill=(200,200,200))
img.save(S+'/banner.jpg',quality=86,optimize=True)
# safe-area preview
p=img.copy(); ImageDraw.Draw(p).rectangle((406,407,1641,745),outline=(0,200,255),width=3); p.resize((1024,576)).save(S+'/banner-check.png')
av=Image.open('/home/claude/OVERLOAD-PLUS/icon-1024.png').convert('RGB').resize((800,800),Image.LANCZOS)
av.save(S+'/avatar.jpg',quality=88,optimize=True)
