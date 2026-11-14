import numpy as np
from PIL import Image
from scipy import ndimage as ndi

def load_mask(path):
    im = Image.open(path).convert('RGB')
    a = np.array(im).astype(int)
    mn = a.min(axis=2)
    bg_like = mn >= 232
    lab, n = ndi.label(bg_like)
    edge = set(np.unique(np.concatenate([lab[0,:],lab[-1,:],lab[:,0],lab[:,-1]]))) - {0}
    bg = np.isin(lab, list(edge))
    # bolsoes brancos internos bem brancos e grandes, encostados no fundo
    pure = mn >= 244
    lab2, n2 = ndi.label(pure)
    sizes = ndi.sum(pure, lab2, range(1, n2+1))
    for i, s in enumerate(sizes, start=1):
        if s > 120:
            m = lab2 == i
            if (ndi.binary_dilation(m, iterations=2) & bg).any():
                bg |= m
    fg = ~bg
    fg = ndi.binary_opening(fg, iterations=1)
    return im, fg

def bands(proj, mingap=6):
    idx = np.where(proj)[0]
    out = []; start = idx[0]; prev = idx[0]
    for i in idx[1:]:
        if i - prev > mingap:
            out.append((start, prev)); start = i
        prev = i
    out.append((start, prev)); return out

if __name__ == '__main__':
    for p in ['1793497529207_image.png','1793497536809_image.png']:
        im, fg = load_mask('/mnt/user-data/uploads/'+p)
        rows = bands(fg.sum(axis=1) > 2, 8)
        print(p, 'rows', rows)
        for (y0,y1) in rows:
            cols = bands(fg[y0:y1+1].sum(axis=0) > 2, 8)
            print('  ', (y0,y1), 'cols', cols)