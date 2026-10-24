"""Apply only Skeleton changes to an exported current theme; never deploys."""
from pathlib import Path
import json
import re
import sys
import shutil

repo = Path(__file__).resolve().parents[2]
source, target = map(Path, sys.argv[1:3])
if source.resolve() == target.resolve():
    raise SystemExit('Use a separate staging directory.')

def read_json(path):
    return json.loads(re.sub(r'^\s*/\*[\s\S]*?\*/', '', path.read_text()))

def write(name, content):
    p = target / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)

def save(name, value):
    write(name, json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Current theme differs at patch anchor: ' + old[:90])
    return text.replace(old, new, 1)

for name in ['sections/rizo-skeleton-drop.liquid', 'assets/rizo-skeleton.css']:
    write(name, (repo / name).read_text())

local_product = (repo / 'sections/main-product.liquid').read_text()
product = (source / 'sections/main-product.liquid').read_text()
guards = local_product.split('{%- liquid\n', 1)[1].split('  assign selected_variant', 1)[0]
product = replace_once(product, '{%- liquid\n', '{%- liquid\n' + guards)
product = replace_once(product, '<section class="pdp"', "{% if is_skeleton %}{{ 'rizo-skeleton.css' | asset_url | stylesheet_tag }}{% endif %}\n<section class=\"pdp{% if is_skeleton %} pdp--skeleton{% endif %}\"")
badge = '<div class="card-badges" style="position: static">{% render \'product-badge\', product: product %}</div>'
product = replace_once(product, badge, '{%- unless skeleton_locked -%}' + badge + '{%- endunless -%}')
form = "        {%- form 'product', product, class: 'pdp-form'"
locked = local_product[local_product.index('        {%- if skeleton_locked -%}'):local_product.index(form)]
product = replace_once(product, form, locked + form)
product = replace_once(product, '        <div class="product-proof-apps">', '        {%- endif -%}\n\n        <div class="product-proof-apps">')
product = replace_once(product, '  <div class="sticky-buy"', '  {%- unless skeleton_locked -%}\n  <div class="sticky-buy"')
product = replace_once(product, '  <div class="overlay-shell" data-overlay="product-media"', '  {%- endunless -%}\n\n  <div class="overlay-shell" data-overlay="product-media"')
product = replace_once(product, '<section class="pdp{% if is_skeleton %}', '{% if is_skeleton %}<script type="application/ld+json">{{ product | structured_data }}</script>{% endif %}\n<section class="pdp{% if is_skeleton %}')
write('sections/main-product.liquid', product)

schema = read_json(source / 'config/settings_schema.json')
group = next(g for g in read_json(repo / 'config/settings_schema.json') if g.get('name') == 'Skeleton release')
group['settings'].append({'type': 'image_picker', 'id': 'skeleton_social_image', 'label': 'Skeleton sharing photograph'})
schema = [g for g in schema if g.get('name') != 'Skeleton release'] + [group]
save('config/settings_schema.json', schema)
locale = read_json(source / 'locales/en.default.json')
locale['skeleton'] = read_json(repo / 'locales/en.default.json')['skeleton']
save('locales/en.default.json', locale)

index = read_json(source / 'templates/index.json')
section = read_json(repo / 'templates/index.json')['sections']['skeleton']
index['sections']['skeleton'] = section
index['order'] = [s for s in index['order'] if s != 'skeleton']
index['order'].insert(index['order'].index('shop'), 'skeleton')
save('templates/index.json', index)

settings = read_json(source / 'config/settings_data.json')
settings['current']['skeleton_feature_enabled'] = True
settings['current']['skeleton_launch_enabled'] = False
settings['current']['skeleton_social_image'] = section['settings']['editorial_image']
save('config/settings_data.json', settings)

outside = read_json(source / 'templates/page.outside.json')
worn = outside['sections']['worn']
worn['blocks']['skeleton-2026'] = {'type':'photo', 'settings':{
    'image': section['settings']['editorial_image'], 'builtin_image':'none',
    'alt':'Model wearing the black RIZO Skeleton Crewneck against a graffiti-covered brick wall',
    'piece':'RIZO Skeleton Crewneck', 'year':'2026', 'full_frame':True}}
worn['block_order'] = ['skeleton-2026'] + [b for b in worn['block_order'] if b != 'skeleton-2026']
save('templates/page.outside.json', outside)

layout = (source / 'layout/theme.liquid').read_text()
anchor = '          assign rizo_share_object = product.featured_image | default: rizo_share_object'
layout = replace_once(layout, anchor, anchor + '''
          if product.id == 8164322508878 and settings.skeleton_social_image != blank
            assign rizo_share_object = settings.skeleton_social_image
          endif''')
write('layout/theme.liquid', layout)

badge = (source / 'snippets/product-badge.liquid').read_text()
badge = replace_once(badge, '  assign badge_label = badge | strip | upcase', '''  if product.id == 8164322508878
    if settings.skeleton_launch_enabled != true or product.published_at == blank
      assign badge = 'skeleton.drop.not_released' | t
    endif
  endif
  assign badge_label = badge | strip | upcase''')
write('snippets/product-badge.liquid', badge)
print('Staged 10 scoped theme files. Live storefront and product inventory were not changed by this script.')
