import { useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { MODE_ICONS } from './modeIcons';
import { GRANDPARIS_BOLD_BASE64 } from './assets/grandParisBoldBase64';
import { CARTO_API_KEY } from './constants';

function getMapHTML(isDark: boolean) {
  const iconsJson = JSON.stringify(MODE_ICONS);
  const bg = isDark ? '#031a3a' : '#eef2f7';
  // CARTO a fermé l'accès anonyme à ces tuiles (basemaps.cartocdn.com) et
  // exige désormais une clé API + le préfixe /rastertiles/ dans l'URL (les
  // anciennes URLs, encore documentées un peu partout, renvoient une tuile
  // "API key required" à la place du fond de carte).
  const tileUrl = isDark
    ? `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`
    : `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    /* Police embarquée en base64 (pas de fichier local accessible depuis la
       WebView) pour que les indices de lignes matchent la police du reste de
       l'app (GrandParis-Bold), au lieu de retomber sur la police système. */
    @font-face{
      font-family:"GrandParis";
      font-weight:800;
      src:url(data:font/otf;base64,${GRANDPARIS_BOLD_BASE64}) format("opentype");
    }
    *{margin:0;padding:0;box-sizing:border-box}
    html,body,#map{height:100%;width:100%;background:${bg}}
    @keyframes pulse{
      0%{transform:scale(0.8);opacity:0.9}
      70%{transform:scale(2.8);opacity:0}
      100%{transform:scale(0.8);opacity:0}
    }
    .u-ring{
      position:absolute;width:32px;height:32px;top:-8px;left:-8px;
      background:rgba(52,152,219,0.28);border-radius:50%;
      animation:pulse 2.2s ease-out infinite;pointer-events:none;
    }
    .u-dot{
      width:16px;height:16px;position:relative;z-index:1;
      background:#3498db;border:3px solid #fff;border-radius:50%;
      box-shadow:0 2px 10px rgba(52,152,219,0.65);
    }
    .u-heading{
      position:absolute;left:50%;top:50%;width:0;height:0;
      margin-left:-4px;margin-top:-13px;
      border-left:4px solid transparent;
      border-right:4px solid transparent;
      border-bottom:5px solid #fff;
      transform-origin:4px 13px;
      transition:transform 0.25s ease-out;
      pointer-events:none;display:none;
    }
    .n-wrap{
      background:#ffffff;
      border:1px solid rgba(0,0,0,0.12);
      box-shadow:0 2px 6px rgba(0,0,0,0.18);
      cursor:pointer;
    }
    .n-icon{
      width:24px;height:24px;
      filter:${isDark ? 'invert(1)' : 'none'};
    }
    .map-tail{
      position:absolute;left:50%;bottom:-7px;transform:translateX(-50%);
      width:0;height:0;pointer-events:none;
      border-left:7px solid transparent;
      border-right:7px solid transparent;
      border-top:8px solid ${isDark ? 'rgba(90,179,245,0.3)' : 'rgba(0,0,0,0.12)'};
    }
    /* Pointe en deux triangles : le grand (contour) et, dessus, le petit (remplissage),
       pour que la pointe ait le même contour que le reste de la bulle. */
    .map-tail::after{
      content:'';position:absolute;left:-6px;top:-9px;
      width:0;height:0;
      border-left:6px solid transparent;
      border-right:6px solid transparent;
      border-top:7px solid ${isDark ? '#010e26' : '#ffffff'};
    }
    .leaflet-control-attribution{
      background:${isDark ? 'rgba(1,14,38,0.4)' : 'rgba(255,255,255,0.55)'}!important;
      box-shadow:none!important;
      border-radius:6px;
      padding:1px 6px!important;
    }
    .leaflet-control-attribution a, .leaflet-control-attribution span{
      color:${isDark ? '#8fb8e6' : '#3d4852'}!important;
      opacity:0.85!important;
    }
  #glass{position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:2000}
  .gl{position:absolute;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);transform:translateZ(0);will-change:backdrop-filter;-webkit-backface-visibility:hidden;backface-visibility:hidden}
  </style>
</head>
<body>
<div id="map"></div>
<div id="glass"></div>
<script>
  var map = L.map('map',{zoomControl:false,attributionControl:false,zoomSnap:0.1,zoomDelta:0.5}).setView([48.8566,2.3522],11.5);

  // Le setView initial ci-dessus déclenche lui-même un moveend (comportement
  // Leaflet normal après un setView programmatique), ce qui lançait aussitôt
  // la recherche des arrêts proches au chargement de l'app, avant même que
  // l'utilisateur touche la carte. On attend donc un vrai geste utilisateur
  // (zoomstart/dragstart) avant de laisser passer le premier viewportChanged
  // — l'app démarre plus vite, sans requête réseau tant que la carte n'a pas
  // été manipulée.
  var _userInteracted=false;
  map.on('zoomstart dragstart',function(){ _userInteracted=true; });

  // Leaflet ignore tout nouveau geste (glisser, pincer) tant que l'animation
  // de zoom court (~270 ms après un zoom, un double-tap ou un pincement) : on
  // avait l'impression d'être bloqué jusqu'à la fin du chargement. Un doigt qui
  // se pose termine maintenant l'animation tout de suite (la carte saute à sa
  // position finale) et le geste part normalement.
  map.getContainer().addEventListener('touchstart',function(){
    if(map._animatingZoom){ map._onZoomTransitionEnd(); }
  },true);

  window._tileLayer = L.tileLayer('${tileUrl}',{
    maxZoom:19, subdomains:'abcd'
  }).addTo(map);

  L.control.attribution({position:'bottomright',prefix:''})
    .addAttribution('<span style="font-size:9px">© CartoDB · OpenStreetMap</span>')
    .addTo(map);

  var userMarker = null;
  var followMode = false;
  var stationMarkers = [];
  var _lastMain = null;
  var _lastPoints = [];
  var _lastExits = [];
  var transportLines = [];
  var transportStops = [];

  function userIcon(){
    return L.divIcon({
      className:'',
      html:'<div class="u-ring"></div><div class="u-heading"></div><div class="u-dot"></div>',
      iconSize:[16,16], iconAnchor:[8,8]
    });
  }

  function setUserLocation(lat,lon){
    var ll=[lat,lon];
    if(!userMarker){
      userMarker=L.marker(ll,{icon:userIcon(),zIndexOffset:2000}).addTo(map);
    } else {
      userMarker.setLatLng(ll);
    }
    if(followMode){ map.panTo(ll,{animate:true,duration:0.5}); }
  }

  // Appelé uniquement au tap du bouton GPS : recentre toujours (avec zoom)
  // et (re)active le suivi automatique de la position.
  function recenterOnUser(lat,lon){
    followMode=true;
    var ll=[lat,lon];
    if(!userMarker){
      userMarker=L.marker(ll,{icon:userIcon(),zIndexOffset:2000}).addTo(map);
    } else {
      userMarker.setLatLng(ll);
    }
    var zoom=15;
    // Si on est déjà quasiment sur la cible, on ne relance pas l'animation
    // (évite un petit "tremblement" quand on retape l'icône déjà centrée).
    var curPt=map.latLngToContainerPoint(map.getCenter());
    var tgtPt=map.latLngToContainerPoint(ll);
    var dist=curPt.distanceTo(tgtPt);
    if(dist<3 && Math.abs(map.getZoom()-zoom)<0.05) return;
    map.flyTo(ll,zoom,{animate:true,duration:0.65});
  }

  // Manipule directement le DOM de l'icône (au lieu de la recréer via
  // setIcon) pour que la transition CSS puisse animer la rotation en douceur.
  function setUserHeading(deg){
    if(!userMarker) return;
    var el=userMarker.getElement();
    if(!el) return;
    var h=el.querySelector('.u-heading');
    if(!h) return;
    if(typeof deg==='number'){
      h.style.display='block';
      h.style.transform='rotate('+deg+'deg)';
    } else {
      h.style.display='none';
    }
  }

  // Un glissement manuel de la carte (pas nos propres panTo/flyTo) coupe le
  // suivi automatique, comme sur Google Maps.
  map.on('dragstart',function(){
    if(followMode){
      followMode=false;
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'followModeExited'}));
    }
  });

  function clearActiveStation(){
    stationMarkers.forEach(function(m){map.removeLayer(m);});
    stationMarkers=[];
    if(_hiddenNearbyId!==null){ _hiddenNearbyId=null; _renderNearbyStops(); }
  }

  function pinIcon(){
    return L.divIcon({
      className:'',
      html:'<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:#FF6B35;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 3px 10px rgba(255,107,53,0.6)"></div>',
      iconSize:[26,26],iconAnchor:[10,22]
    });
  }

  function showStation(id,lat,lon,label){
    // Sélectionner une station doit couper le suivi GPS : sinon, le prochain
    // point de position (toutes les 3s) recentre la carte sur l'utilisateur
    // alors qu'il est en train de consulter un arrêt précis.
    if(followMode){
      followMode=false;
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'followModeExited'}));
    }
    stationMarkers.forEach(function(m){map.removeLayer(m);});
    stationMarkers=[];
    var m=L.marker([lat,lon],{icon:pinIcon(),zIndexOffset:3000})
      .addTo(map)
      .on('click',function(e){
        e.originalEvent.stopPropagation();
        window.ReactNativeWebView.postMessage(
          JSON.stringify({type:'stationSelected',id:id,label:label||id})
        );
      });
    stationMarkers.push(m);
    _lastMain={lat:lat,lon:lon,modeGroups:null};
    _lastPoints=[];
    _lastExits=[];
  }

  function flyToStation(lat,lon,zoom){
    zoom=zoom||15;
    // Décale le centre vers le bas pour que la gare apparaisse dans le tiers supérieur,
    // visible au-dessus du panneau des horaires qui couvre le bas de l'écran.
    var offset=map.getSize().y*0.22;
    var shifted=map.unproject(map.project([lat,lon],zoom).add([0,offset]),zoom);
    // Si on est déjà quasiment sur la cible, on ne relance pas l'animation
    // (évite un petit "tremblement" quand on reclique la station déjà centrée).
    var curPt=map.latLngToContainerPoint(map.getCenter());
    var tgtPt=map.latLngToContainerPoint(shifted);
    var dist=curPt.distanceTo(tgtPt);
    if(dist<3 && Math.abs(map.getZoom()-zoom)<0.05) return;
    // setView animé (transitions CSS, ~0,25 s) plutôt que flyTo : flyTo recalcule
    // et repositionne TOUS les marqueurs et le canevas à chaque image pendant
    // 0,9 s — très coûteux dans une gare à nombreux arrêts.
    map.flyTo(shifted,zoom,{animate:true,duration:0.65});
  }

  function stopPointIcon(lines){
    var items=(lines&&lines.length?lines:[{code:'?',color:'888888',textColor:'#fff'}]);
    var H=22;
    var badges=items.map(function(l){
      return '<div style="min-width:'+H+'px;height:'+H+'px;background:#'+l.color+';color:'+l.textColor+';'
        +'font-family:GrandParis;font-size:11px;font-weight:800;border-radius:5px;padding:0 4px;box-sizing:border-box;'
        +'display:flex;align-items:center;justify-content:center;white-space:nowrap">'+l.code+'</div>';
    }).join('');
    var pad=4,gap=4;
    // On ne peut pas mesurer le texte rendu à l'avance en JS, donc plutôt que
    // d'essayer (encore) de deviner la largeur exacte, le badge se centre
    // lui-même via position absolute + translateX(-50%) : peu importe sa
    // largeur réelle, il reste pile centré sur le point de la carte.
    var html='<div class="sp-badge" style="position:absolute;left:50%;top:0;transform:translateX(-50%);'
      +'background:#fff;border:1px solid rgba(0,0,0,0.15);border-radius:8px;'
      +'padding:'+pad+'px;box-shadow:0 1px 5px rgba(0,0,0,0.3);display:flex;align-items:center;'
      +'gap:'+gap+'px;width:max-content">'+badges+'<div class="map-tail"></div></div>';
    var h=H+pad*2;
    var wZoneClic=pad*2+items.length*(H+16)+(items.length-1)*gap;
    // La pointe du triangle (7px de haut, collée au bas du badge) doit
    // tomber pile sur le point d'ancrage.
    return L.divIcon({className:'',html:html,iconSize:[wZoneClic,h+8],iconAnchor:[wZoneClic/2,h+7]});
  }

  // Sortie numérotée d'une station (ex: "sortie 9, pl. H. Frenay" à Gare de
  // Lyon) — un simple rond bleu foncé fixe, indépendant du thème clair/sombre
  // (contrairement aux badges de ligne, sa couleur ne doit pas changer).
  // Le rond et la pointe sont dessinés comme un seul tracé SVG (au lieu d'un
  // cercle CSS + triangle CSS séparés) pour que le contour blanc reste
  // continu tout autour, y compris sur la pointe — avec deux formes CSS
  // distinctes, le triangle masquait le bas du contour du cercle.
  var EXIT_W=32, EXIT_H=32;
  function exitIcon(number,name){
    var label='<div class="exit-label" style="position:absolute;left:50%;bottom:'+(EXIT_H+10)+'px;transform:translateX(-50%);'
      +'background:#0a0082;color:#fff;font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;'
      +'white-space:nowrap;display:none;box-shadow:0 1px 5px rgba(0,0,0,0.35)">'+(name||'')+'</div>';
    var svg='<svg width="'+EXIT_W+'" height="'+EXIT_H+'" viewBox="0 0 32 32" '
      +'style="position:absolute;left:0;top:0;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.4))">'
      +'<path class="exit-pin" d="M20.65,22.97 A11,11 0 1,0 11.35,22.97 L16,32 Z" fill="#0a0082" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>'
      +'<text x="16" y="17" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">'+number+'</text>'
      +'</svg>';
    var html='<div style="position:absolute;left:50%;top:0;transform:translateX(-50%);'
      +'width:'+EXIT_W+'px;height:'+EXIT_H+'px">'+svg+label+'</div>';
    return L.divIcon({className:'',html:html,iconSize:[EXIT_W,EXIT_H],iconAnchor:[EXIT_W/2,EXIT_H]});
  }

  // Icône du point principal de la station : réutilise exactement le même
  // encadré "n-wrap" que les pastilles de mode déjà visibles de loin sur la
  // carte, en ajoutant les codes de ligne (même taille que le symbole) juste
  // en dessous de chaque mode non-bus (RER, Métro, Train, Tram...). Ces
  // modes-là n'ont pas besoin qu'on aille chercher leurs poteaux physiques
  // (contrairement au bus, dispersé, géré à part).
  function mainStationIcon(modeGroups){
    if(!modeGroups||!modeGroups.length){ return pinIcon(); }
    var SZ=22;
    var maxLines=1;
    modeGroups.forEach(function(g){ var n=(g.lines||[]).length; if(n>maxLines)maxLines=n; });
    var cells=modeGroups.map(function(g){
      var icon=NEARBY_ICONS[g.mode]||NEARBY_ICONS['BUS'];
      var codes=(g.lines||[]).map(function(l){
        return '<div style="min-width:'+SZ+'px;height:'+SZ+'px;background:#'+l.color+';color:'+l.textColor+';'
          +'font-family:GrandParis;font-size:11px;font-weight:800;border-radius:5px;padding:0 3px;box-sizing:border-box;'
          +'display:flex;align-items:center;justify-content:center;white-space:nowrap;margin-top:3px">'+l.code+'</div>';
      }).join('');
      return '<div style="display:flex;flex-direction:column;align-items:center">'
        +'<img class="n-icon" src="'+icon+'" style="width:'+SZ+'px;height:'+SZ+'px"/>'
        +codes
        +'</div>';
    }).join('<div style="width:8px"></div>');
    var pad=6;
    var h=SZ+maxLines*(SZ+3)+pad*2;
    // Rayon fixe : le calculer à partir de la hauteur (qui grandit avec le
    // nombre de lignes empilées) rendait l'encadré de plus en plus rond
    // jusqu'à couper les coins sur les stations avec beaucoup de lignes.
    var br=14;
    // Comme pour les poteaux : le bloc se centre lui-même (position
    // absolute + translateX), pas besoin d'estimer sa largeur exacte.
    var html='<div class="n-wrap" style="position:absolute;left:50%;top:0;transform:translateX(-50%);'
      +'display:flex;align-items:flex-start;justify-content:center;padding:'+pad+'px;'
      +'border-radius:'+br+'px;width:max-content">'+cells+'<div class="map-tail"></div></div>';
    var wZoneClic=modeGroups.length*(SZ+16)+pad*2;
    // La pointe du triangle (7px de haut, collée au bas du bloc) doit
    // tomber pile sur le point d'ancrage.
    return L.divIcon({className:'',html:html,iconSize:[wZoneClic,h+8],iconAnchor:[wZoneClic/2,h+7]});
  }

  // Affiche le point principal de la station (RER/Métro/Train/Tram... avec
  // leurs lignes) et, s'ils existent, chaque arrêt physique (poteau) de bus
  // avec ses propres lignes — puis ajuste le zoom pour tous les montrer.
  // Utile pour les stations où les arrêts de bus sont dispersés à des
  // endroits différents.
  function showStopCluster(id,label,main,points,moveCamera,exits){
    // Idem showStation : sélectionner une station coupe le suivi GPS, sinon
    // la position revient recentrer la carte au prochain point pendant que
    // l'utilisateur consulte un arrêt.
    if(followMode){
      followMode=false;
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'followModeExited'}));
    }
    stationMarkers.forEach(function(m){map.removeLayer(m);});
    stationMarkers=[];
    // Évite la superposition avec la pastille "arrêts à proximité" déjà
    // affichée au même endroit (visible dès le zoom large).
    _hiddenNearbyId=id;
    _renderNearbyStops();

    function onClickMarker(e){
      e.originalEvent.stopPropagation();
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'stationSelected',id:id,label:label||id}));
    }

    var allPts=[];
    if(main){
      var mm=L.marker([main.lat,main.lon],{icon:mainStationIcon(main.modeGroups),zIndexOffset:3000})
        .addTo(map).on('click',onClickMarker);
      stationMarkers.push(mm);
      allPts.push([main.lat,main.lon]);
    }
    (points||[]).forEach(function(p){
      var m=L.marker([p.lat,p.lon],{icon:stopPointIcon(p.lines),zIndexOffset:3000})
        .addTo(map).on('click',onClickMarker);
      stationMarkers.push(m);
      allPts.push([p.lat,p.lon]);
    });
    // Une seule bulle de nom de sortie visible à la fois : cliquer sur une
    // sortie referme celle éventuellement ouverte sur une autre.
    var exitLabels=[];
    (exits||[]).forEach(function(e){
      var m=L.marker([e.lat,e.lon],{icon:exitIcon(e.number,e.name),zIndexOffset:3500})
        .addTo(map)
        .on('click',function(ev){
          ev.originalEvent.stopPropagation();
          var el=m.getElement();
          var lbl=el&&el.querySelector('.exit-label');
          if(!lbl) return;
          var willShow=lbl.style.display!=='block';
          exitLabels.forEach(function(other){ if(other!==lbl) other.style.display='none'; });
          lbl.style.display = willShow ? 'block' : 'none';
        });
      stationMarkers.push(m);
      var elNow=m.getElement();
      var lblNow=elNow&&elNow.querySelector('.exit-label');
      if(lblNow) exitLabels.push(lblNow);
      // Incluses dans le calcul du zoom : la station doit être cadrée pour
      // que toutes ses sorties restent visibles à l'écran.
      allPts.push([e.lat,e.lon]);
    });
    // Mémorisé pour pouvoir recadrer plus tard sans tout redemander (bouton
    // de recentrage manuel, voir recenterActiveStation).
    _lastMain=main;
    _lastPoints=points||[];
    _lastExits=exits||[];

    if(!allPts.length||moveCamera===false){ return; }
    _flyToCluster(allPts,main);
  }

  // Marge généreuse : les encadrés de lignes prennent de la place, surtout
  // quand tout est concentré sur un seul point. Le zoom s'adapte à la
  // taille réelle de l'encadré principal (nb de modes, lignes empilées)
  // plutôt qu'une valeur fixe — une petite station RER seule n'a pas
  // besoin d'être aussi dézoomée qu'un gros pôle multimodal.
  function _flyToCluster(allPts,main){
    if(allPts.length===1){
      var zoom=15;
      if(main&&main.modeGroups&&main.modeGroups.length){
        var nGroups=main.modeGroups.length;
        var maxL=1;
        main.modeGroups.forEach(function(g){ var n=(g.lines||[]).length; if(n>maxL)maxL=n; });
        zoom=15-Math.min(1.5,(nGroups-1)*0.35+(maxL-1)*0.25);
      }
      flyToStation(allPts[0][0],allPts[0][1],zoom);
      return;
    }
    var bounds=L.latLngBounds(allPts);
    var h=map.getSize().y;
    map.flyToBounds(bounds,{
      paddingTopLeft:[65,85],
      paddingBottomRight:[65,Math.round(h*0.52)],
      animate:true,duration:0.65,
    });
  }

  // Recentre la vue sur la station actuellement affichée dans le panneau,
  // sans rien redemander au backend (bouton "localiser" du panneau horaires).
  function recenterActiveStation(){
    var allPts=[];
    if(_lastMain) allPts.push([_lastMain.lat,_lastMain.lon]);
    (_lastPoints||[]).forEach(function(p){ allPts.push([p.lat,p.lon]); });
    (_lastExits||[]).forEach(function(e){ allPts.push([e.lat,e.lon]); });
    if(!allPts.length) return;
    _flyToCluster(allPts,_lastMain);
  }

  function setTransportData(data){
    transportLines.forEach(function(l){map.removeLayer(l);});
    transportStops.forEach(function(m){map.removeLayer(m);});
    transportLines=[];transportStops=[];
    var modeColors={RER:'#0064B0',METRO:'#6E6E6E',TRAM:'#6EC4E8',TRAIN:'#87CEEB',CABLE:'#82C341'};
    var modePrio={TRAM:1,CABLE:2,METRO:3,TRAIN:4,RER:5};
    var sortedLines=(data.lines||[]).slice().sort(function(a,b){return (modePrio[a.mode]||0)-(modePrio[b.mode]||0);});
    sortedLines.forEach(function(l){
      if(!l.coords||!l.coords.length)return;
      var color='#'+(l.color||'888888');
      var weight=(l.mode==='RER'||l.mode==='TRAIN')?4:(l.mode==='METRO')?2.5:1.5;
      l.coords.forEach(function(seg){
        if(seg&&seg.length>=2){
          transportLines.push(L.polyline(seg,{color:color,weight:weight,opacity:1}).addTo(map));
        }
      });
    });
    (data.stops||[]).forEach(function(s){
      if(s.lat==null||s.lon==null)return;
      var color=modeColors[s.mode]||'#888888';
      var icon=L.divIcon({className:'',html:'<div style="width:8px;height:8px;border-radius:50%;background:'+color+';border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',iconSize:[8,8],iconAnchor:[4,4]});
      transportStops.push(L.marker([s.lat,s.lon],{icon:icon,zIndexOffset:500}).addTo(map));
    });
  }

  // Verre dépoli fait ICI (backdrop-filter, géré par le moteur de la WebView)
  // plutôt que par un flou natif qui recopie la WebView dans un calque et la
  // fait planter. Un rectangle flou par surface flottante de l'app, placé aux
  // coordonnées envoyées par le natif (px CSS = dp). Pas de backtick ici.
  function setGlassRects(list){
    var host=document.getElementById('glass'); var seen={};
    var CB='cubic-bezier(0.22,1,0.36,1)';
    list.forEach(function(r){
      seen[r.id]=1;
      var el=document.getElementById('gl_'+r.id);
      var neuf=false;
      if(!el){ el=document.createElement('div'); el.id='gl_'+r.id; el.className='gl'; host.appendChild(el); neuf=true; }
      var d=r.d||450;
      el.style.transition=(r.anim&&!neuf)?('transform '+d+'ms '+CB+', bottom '+d+'ms '+CB+', opacity '+d+'ms linear'):'none';
      el.style.opacity=(r.op==null)?'1':String(r.op);
      el.style.left=r.x+'px';
      el.style.top=(r.y==null)?'auto':r.y+'px';
      el.style.bottom=(r.b==null)?'auto':r.b+'px';
      el.style.width=r.w+'px';
      el.style.height=(r.h==null)?'auto':r.h+'px';
      el.style.borderRadius=(typeof r.r==='number')?r.r+'px':r.r;
      el.style.boxShadow=r.o||'';
      var bf=r.nf?'none':'';
      el.style.backdropFilter=bf; el.style.webkitBackdropFilter=bf;
      el.style.transform='translate3d('+(r.tx||0)+'px,0,0)';
    });
    Array.prototype.slice.call(host.children).forEach(function(el){
      if(!seen[el.id.slice(3)]) host.removeChild(el);
    });
  }

  function setTheme(isDark){
    var url = isDark
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}';
    if(window._tileLayer){ map.removeLayer(window._tileLayer); }
    window._tileLayer = L.tileLayer(url,{maxZoom:19,subdomains:'abcd'}).addTo(map);
    document.body.style.background = isDark ? '#031a3a' : '#eef2f7';
    document.getElementById('map').style.background = isDark ? '#031a3a' : '#eef2f7';
    var s = document.getElementById('_gp_dots');
    if(!s){ s=document.createElement('style'); s.id='_gp_dots'; document.head.appendChild(s); }
    s.textContent = isDark
      ? 'img.leaflet-tile{filter:sepia(0.9) hue-rotate(180deg) saturate(2.5) brightness(2.2)!important}'
        + '.n-icon{filter:invert(1)!important}'
        + '.n-wrap{background:#010e26!important;border-color:rgba(90,179,245,0.3)!important}'
        + '.sp-badge{background:#010e26!important;border-color:rgba(90,179,245,0.3)!important}'
        + '.map-tail{border-top-color:rgba(90,179,245,0.3)!important}'
        + '.map-tail::after{border-top-color:#010e26!important}'
        + '.exit-pin{stroke:rgba(255,255,255,0.75)!important;stroke-width:1.5px!important}'
      : '.n-icon{filter:none!important}'
        + '.n-wrap{background:#ffffff!important;border-color:rgba(0,0,0,0.12)!important}'
        + '.sp-badge{background:#ffffff!important;border-color:rgba(0,0,0,0.12)!important}'
        + '.map-tail{border-top-color:rgba(0,0,0,0.12)!important}'
        + '.map-tail::after{border-top-color:#ffffff!important}'
        + '.exit-pin{stroke:#fff!important;stroke-width:2px!important}';
    _nbDark=isDark;
    Object.keys(_nbImgs).forEach(_nbBuildBitmap);
    _nbSchedule();
    var attr=document.querySelector('.leaflet-control-attribution');
    if(attr){
      attr.style.background = isDark ? 'rgba(1,14,38,0.4)' : 'rgba(255,255,255,0.55)';
      attr.querySelectorAll('a,span').forEach(function(el){
        el.style.color = isDark ? '#8fb8e6' : '#3d4852';
      });
    }
  }

  var NEARBY_ICONS=${iconsJson};
  var MODE_MIN_ZOOM={RER:11.5,TRAIN:11.5,METRO:13,TRAM:13.5,CABLE:13.5,BUS:15,FLUVIAL:14,AUTRE:14.5};
  var MODE_ICON_SIZE={RER:24,TRAIN:24,METRO:20,TRAM:18,CABLE:18,BUS:14,FLUVIAL:16,AUTRE:14};
  var MODE_ZINDEX={RER:790,TRAIN:770,METRO:750,TRAM:730,CABLE:710,FLUVIAL:690,BUS:670,AUTRE:650};
  var _allNearbyStops=[];
  var _hiddenNearbyId=null;
  var _nbDark=${isDark ? 'true' : 'false'};

  // ── Pastilles des arrêts proches : dessinées sur UN SEUL canvas ──────────────
  // Avant : un marker HTML (div + <img> base64) par arrêt, soit 150 à 500
  // éléments dans le DOM, repositionnés à chaque image d'un geste de zoom et
  // recréés à chaque changement de zoom/données — c'était ce qui faisait
  // saccader la carte dans Paris (dense en métro) et la figeait après un zoom,
  // le temps de tout reconstruire. Ici : aucun élément par arrêt, un seul
  // dessin par image, et la création/suppression ne coûte plus rien.
  var _nbImgs={};      // mode -> Image SVG chargée
  var _nbBitmaps={};   // mode -> bitmap prérendu (inversé en thème sombre)
  var NB_BMP=96;
  var _nbDrawn=[];     // pastilles dessinées à la dernière image (pour le tap)

  function _minZoomForStop(s){
    var min=99;
    (s.modes||[]).forEach(function(m){ var z=MODE_MIN_ZOOM[m]||15; if(z<min)min=z; });
    return min;
  }

  function _nbBuildBitmap(mode){
    var img=_nbImgs[mode];
    if(!img) return;
    var c=document.createElement('canvas'); c.width=NB_BMP; c.height=NB_BMP;
    var x=c.getContext('2d');
    x.drawImage(img,0,0,NB_BMP,NB_BMP);
    if(_nbDark){
      try{
        var d=x.getImageData(0,0,NB_BMP,NB_BMP), a=d.data;
        for(var i=0;i<a.length;i+=4){ a[i]=255-a[i]; a[i+1]=255-a[i+1]; a[i+2]=255-a[i+2]; }
        x.putImageData(d,0,0);
      }catch(e){}
    }
    _nbBitmaps[mode]=c;
  }
  Object.keys(NEARBY_ICONS).forEach(function(mode){
    var img=new Image();
    img.onload=function(){ _nbImgs[mode]=img; _nbBuildBitmap(mode); _nbSchedule(); };
    img.src=NEARBY_ICONS[mode];
  });

  // Le canvas vit dans son propre "pane" (entre les tracés et les markers),
  // recalé sur la vue à chaque image : il couvre toujours exactement l'écran.
  var _nbPane=map.createPane('nearbyPane');
  _nbPane.style.zIndex=590;
  _nbPane.style.pointerEvents='none';
  var _nbCanvas=document.createElement('canvas');
  _nbCanvas.className='leaflet-zoom-animated';
  _nbPane.appendChild(_nbCanvas);
  var _nbCtx=_nbCanvas.getContext('2d');
  var _nbSize=null, _nbCenter=null, _nbZoom=null, _nbRaf=0;

  function _nbSchedule(){
    if(_nbRaf) return;
    _nbRaf=requestAnimationFrame(function(){ _nbRaf=0; _drawNearby(); });
  }

  function _nbRoundRect(ctx,x,y,w,h,r){
    r=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  function _drawNearby(){
    var size=map.getSize(), dpr=window.devicePixelRatio||1;
    if(!_nbSize||_nbSize.x!==size.x||_nbSize.y!==size.y){
      _nbSize=size;
      _nbCanvas.width=Math.round(size.x*dpr);
      _nbCanvas.height=Math.round(size.y*dpr);
      _nbCanvas.style.width=size.x+'px';
      _nbCanvas.style.height=size.y+'px';
    }
    L.DomUtil.setPosition(_nbCanvas,map.containerPointToLayerPoint([0,0]));
    _nbCenter=map.getCenter(); _nbZoom=map.getZoom();
    var ctx=_nbCtx, z=_nbZoom;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,size.x,size.y);
    _nbDrawn=[];
    if(z<11.5) return;

    var scale=z<12.5?0.62:z<13?0.72:z<13.5?0.80:z<14?0.88:z<15?0.96:z<16?1.05:z<17?1.2:1.4;
    var items=[];
    for(var k=0;k<_allNearbyStops.length;k++){
      var s=_allNearbyStops[k];
      if(s.lat==null||s.lon==null)continue;
      if(_hiddenNearbyId!==null&&(s.id===_hiddenNearbyId||s.stop_area_id===_hiddenNearbyId))continue;
      if(_minZoomForStop(s)>z)continue;
      var p=map.latLngToContainerPoint([s.lat,s.lon]);
      if(p.x<-40||p.y<-40||p.x>size.x+40||p.y>size.y+40)continue;
      var isPoint=s.id&&s.id.indexOf('stop_point:')===0;
      var visibleModes=(s.modes||[]).filter(function(m){
        if((MODE_MIN_ZOOM[m]||15)>z)return false;
        if(isPoint) return m==='BUS'||m==='FLUVIAL'||m==='CABLE';
        return m!=='BUS'&&m!=='FLUVIAL';
      });
      if(!visibleModes.length)continue;
      var maxSz=0,bestZ=0;
      visibleModes.forEach(function(m){
        var s2=Math.round((MODE_ICON_SIZE[m]||14)*scale); if(s2>maxSz)maxSz=s2;
        var zz=MODE_ZINDEX[m]||670; if(zz>bestZ)bestZ=zz;
      });
      var sz=visibleModes.length>1?Math.max(maxSz-2,12):maxSz;
      var gap=3, pad=Math.round(sz*0.18), inner=sz+pad*2;
      var totalW=visibleModes.length*sz+(visibleModes.length-1)*gap;
      var w=(visibleModes.length===1?inner:totalW+pad*2)+2, h=inner+2;
      items.push({s:s,x:p.x,y:p.y,w:w,h:h,sz:sz,gap:gap,totalW:totalW,modes:visibleModes,bestZ:bestZ,r:Math.round((inner+2)*0.22)});
    }
    items.sort(function(a,b){return a.bestZ-b.bestZ;});

    ctx.lineWidth=1;
    var fill=_nbDark?'#010e26':'#ffffff';
    var stroke=_nbDark?'rgba(90,179,245,0.3)':'rgba(0,0,0,0.12)';
    items.forEach(function(it){
      // Cadre ET icônes partent du même coin arrondi au pixel : sinon l'icône
      // (positionnée au dixième de pixel près) flottait dans son cadre pendant
      // que la carte bouge.
      var bx=Math.round(it.x-it.w/2), by=Math.round(it.y-it.h/2);
      var x=bx+0.5, y=by+0.5;
      _nbRoundRect(ctx,x,y+1.5,it.w-1,it.h-1,it.r);
      ctx.fillStyle='rgba(0,0,0,0.16)'; ctx.fill();
      _nbRoundRect(ctx,x,y,it.w-1,it.h-1,it.r);
      ctx.fillStyle=fill; ctx.fill();
      ctx.strokeStyle=stroke; ctx.stroke();
      var ix=bx+Math.round((it.w-it.totalW)/2), iy=by+Math.round((it.h-it.sz)/2);
      it.modes.forEach(function(m){
        var b=_nbBitmaps[m]||_nbBitmaps['BUS'];
        if(b) ctx.drawImage(b,ix,iy,it.sz,it.sz);
        ix+=it.sz+it.gap;
      });
      _nbDrawn.push(it);
    });
  }

  // Zoom animé (double-tap, fin de pincement...) : le canvas suit l'échelle de
  // la carte, comme les tracés, puis est redessiné net à la fin.
  map.on('zoomanim',function(e){
    if(!_nbCenter) return;
    var sc=map.getZoomScale(e.zoom,_nbZoom);
    var viewHalf=map.getSize().multiplyBy(0.5);
    var cur=map.project(_nbCenter,e.zoom);
    var off=viewHalf.multiplyBy(-sc).add(cur).subtract(map._getNewPixelOrigin(e.center,e.zoom));
    L.DomUtil.setTransform(_nbCanvas,off,sc);
  });
  map.on('move zoom viewreset resize',_nbSchedule);
  map.on('moveend zoomend',_drawNearby);

  function _renderNearbyStops(){ _nbSchedule(); }

  function setNearbyStops(stops){
    _allNearbyStops=stops;
    _nbSchedule();
  }

  map.on('click',function(e){
    // Tap sur une pastille d'arrêt : on cherche la plus haute sous le doigt
    // (marge de 6px pour les petites pastilles).
    var cp=e.containerPoint;
    for(var i=_nbDrawn.length-1;i>=0;i--){
      var d=_nbDrawn[i];
      if(Math.abs(cp.x-d.x)<=d.w/2+6&&Math.abs(cp.y-d.y)<=d.h/2+6){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'stationSelected',id:d.s.stop_area_id||d.s.id,label:d.s.label}));
        return;
      }
    }
    // On ne vide plus les poteaux ici : un tap sur la carte ne fait que
    // refermer le volet des horaires côté RN (fermerPanel), la vue de
    // l'arrêt (poteaux compris) doit rester tant qu'on ne quitte pas
    // explicitement (clearActiveStation appelé depuis quitterVueArret).
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'mapTapped'}));
  });

  var _vpTimer=null;
  map.on('moveend zoomend',function(){
    if(!_userInteracted) return;
    clearTimeout(_vpTimer);
    _vpTimer=setTimeout(function(){
      var c=map.getCenter();
      var z2=map.getZoom();
           var maxR=z2<=13?15000:z2<=14?8000:5000;
           var radius=Math.min(Math.round(c.distanceTo(map.getBounds().getNorthEast())),maxR);
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'viewportChanged',lat:c.lat,lon:c.lng,zoom:map.getZoom(),radius:radius}));
    },600);
  });

</script>
</body>
</html>`;}

export type NearbyStopMarker = { id: string; stop_area_id: string; label: string; lat: number; lon: number; modes: string[] };

export type MapWebViewRef = {
  setUserLocation: (lat: number, lon: number) => void;
  recenterOnUser: (lat: number, lon: number) => void;
  setUserHeading: (deg: number | null) => void;
  clearActiveStation: () => void;
  setTheme: (isDark: boolean) => void;
  flyTo: (lat: number, lon: number) => void;
  showStation: (id: string, lat: number, lon: number, label?: string) => void;
  showStopCluster: (
    id: string, label: string,
    main: { lat: number; lon: number; modeGroups: Array<{ mode: string; lines: Array<{ code: string; color: string; textColor: string }> }> } | null,
    points: Array<{ lat: number; lon: number; lines: Array<{ code: string; color: string; textColor: string }> }>,
    moveCamera?: boolean,
    exits?: Array<{ number: number; name: string; lat: number; lon: number }>
  ) => void;
  setTransportData: (data: { stops: any[]; lines: any[] }) => void;
  setNearbyStops: (stops: NearbyStopMarker[]) => void;
  recenterActiveStation: () => void;
  clearCache: () => void;
  setGlassRects: (rects: Array<{ id: string; x: number; y?: number; w: number; h?: number; b?: number; r: number | string; o?: string; tx?: number; anim?: boolean; d?: number; nf?: boolean; op?: number }>) => void;
};

type Props = {
  onStationSelected?: (id: string, label: string) => void;
  onViewportChanged?: (lat: number, lon: number, zoom: number, radius: number) => void;
  onMapTapped?: () => void;
  onFollowExited?: () => void;
  onReady?: () => void;
  isDark?: boolean;
};

const MapWebView = forwardRef<MapWebViewRef, Props>(({ onStationSelected, onViewportChanged, onMapTapped, onFollowExited, onReady, isDark }, ref) => {
  const wvRef = useRef<WebView>(null);
  const [htmlSource] = useState(() => ({ html: getMapHTML(isDark ?? false) }));
  const isMounted = useRef(false);

  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    wvRef.current?.injectJavaScript(`setTheme(${isDark ?? false});true;`);
  }, [isDark]);

  useImperativeHandle(ref, () => ({
    setUserLocation: (lat, lon) => {
      wvRef.current?.injectJavaScript(`setUserLocation(${lat},${lon});true;`);
    },
    recenterOnUser: (lat, lon) => {
      wvRef.current?.injectJavaScript(`recenterOnUser(${lat},${lon});true;`);
    },
    setUserHeading: (deg) => {
      wvRef.current?.injectJavaScript(`setUserHeading(${deg === null ? 'null' : deg});true;`);
    },
    clearActiveStation: () => {
      wvRef.current?.injectJavaScript(`clearActiveStation();true;`);
    },
    setTheme: (isDark) => {
      wvRef.current?.injectJavaScript(`setTheme(${isDark});true;`);
    },
    flyTo: (lat, lon) => {
      wvRef.current?.injectJavaScript(`flyToStation(${lat},${lon});true;`);
    },
    showStation: (id, lat, lon, label) => {
      wvRef.current?.injectJavaScript(`showStation(${JSON.stringify(id)},${lat},${lon},${JSON.stringify(label??id)});true;`);
    },
    showStopCluster: (id, label, main, points, moveCamera, exits) => {
      wvRef.current?.injectJavaScript(`showStopCluster(${JSON.stringify(id)},${JSON.stringify(label)},${JSON.stringify(main)},${JSON.stringify(points)},${moveCamera === false ? 'false' : 'true'},${JSON.stringify(exits || [])});true;`);
    },
    recenterActiveStation: () => {
      wvRef.current?.injectJavaScript(`recenterActiveStation();true;`);
    },
    // Vide le cache HTTP de la WebView (tuiles de carte mémorisées, ~180 jours
    // de validité côté CARTO). Les tuiles se retéléchargent ensuite au besoin.
    setGlassRects: (rects) => {
      wvRef.current?.injectJavaScript(`setGlassRects(${JSON.stringify(rects)});true;`);
    },
    clearCache: () => {
      wvRef.current?.clearCache?.(true);
    },
    setTransportData: (data) => {
      wvRef.current?.injectJavaScript(`setTransportData(${JSON.stringify(data)});true;`);
    },
    setNearbyStops: (stops) => {
      wvRef.current?.injectJavaScript(`setNearbyStops(${JSON.stringify(stops)});true;`);
    },
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={wvRef}
        source={htmlSource}
        style={StyleSheet.absoluteFill}
        scrollEnabled={false}
        bounces={false}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        startInLoadingState={true}
        onLoadEnd={onReady}
        renderLoading={() => (
          <View style={[styles.loader, { backgroundColor: isDark ? '#031a3a' : '#eef2f7' }]}>
            <ActivityIndicator size="large" color="#3498db" />
          </View>
        )}
        onMessage={(e) => {
          try {
            const d = JSON.parse(e.nativeEvent.data);
            if (d.type === 'stationSelected') onStationSelected?.(d.id, d.label);
            if (d.type === 'viewportChanged') onViewportChanged?.(d.lat, d.lon, d.zoom, d.radius ?? 1000);
            if (d.type === 'mapTapped') onMapTapped?.();
            if (d.type === 'followModeExited') onFollowExited?.();
          } catch {}
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  loader: {
    // `StyleSheet.absoluteFillObject` a été retiré en RN 0.86 (seul
    // `absoluteFill`, la référence de style non-spreadable, reste exporté).
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MapWebView;
