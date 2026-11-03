# Drop Havoc render gate: a user with saved night mode must still get the day look (no black ground).
import sys
from playwright.sync_api import sync_playwright
url=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8099/'
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_page(viewport={'width':1280,'height':720})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script("if(!sessionStorage.getItem('x')){localStorage.setItem('arena.time','\"night\"');sessionStorage.setItem('x','1')}")
    pg.goto(url);pg.wait_for_timeout(6000)
    pg.get_by_text('Start practice').click();pg.wait_for_timeout(3000);pg.get_by_text('Drop!').click();pg.wait_for_timeout(15000)
    pg.screenshot(path='/tmp/render.png')
    t=pg.evaluate("localStorage.getItem('arena.time')")
    from PIL import Image
    im=Image.open('/tmp/render.png').convert('RGB');px=list(im.crop((0,360,1280,720)).get_flattened_data()) if hasattr(Image.Image,'get_flattened_data') else list(im.crop((0,360,1280,720)).getdata())
    lum=sum(sum(c) for c in px)/len(px)/3;green=sum(1 for r,g,bb in px if g>r+8 and g>bb+8)/len(px)
    print('time',t,'lum',round(lum),'green',round(green,3),'errors',errs[:3])
    b.close()
    sys.exit(0 if (t=='"day"' and lum>60 and green>0.05 and not errs) else 1)
