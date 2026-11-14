import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import sys, json

def load(name):
    im = Image.open(f'raw/{name}.png').convert('RGB')
    a = np.array(im).astype(int)
    # fundo: quase branco
    bg = (a[:,:,0]>235)&(a[:,:,1]>235)&(a[:,:,2]>235)
    # só remove o branco conectado à borda (preserva branco interno: camisa, bola)
    lab, n = ndi.label(bg)
    border = set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    mask_bg = np.isin(lab, list(border))
    alpha = (~mask_bg).astype(np.uint8)*255
    rgba = np.dstack([a.astype(np.uint8), alpha])
    return rgba

def components(rgba, dil=6, min_area=1500):
    fg = rgba[:,:,3]>0
    d = ndi.binary_dilation(fg, iterations=dil)
    lab, n = ndi.label(d)
    objs = ndi.find_objects(lab)
    boxes=[]
    for i,sl in enumerate(objs):
        sub = fg[sl] & (lab[sl]==i+1)
        if sub.sum()<min_area: continue
        ys,xs = np.where(sub)
        y0=sl[0].start+ys.min(); y1=sl[0].start+ys.max()+1
        x0=sl[1].start+xs.min(); x1=sl[1].start+xs.max()+1
        boxes.append((x0,y0,x1,y1))
    return boxes

if __name__=='__main__':
    for name in sys.argv[1:]:
        rgba = load(name)
        b = components(rgba)
        print(name, len(b))
        for x in sorted(b,key=lambda t:(round(t[1]/100),t[0])): print('  ',x, x[2]-x[0], x[3]-x[1])
