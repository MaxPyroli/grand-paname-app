import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { MODE_ICONS } from './modeIcons';

function getMapHTML(isDark: boolean) {
  const iconsJson = JSON.stringify(MODE_ICONS);
  const bg = isDark ? '#031a3a' : '#eef2f7';
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
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
    .s-dot{
      width:11px;height:11px;
      background:#25303b;border:2.5px solid #fff;border-radius:50%;
      box-shadow:0 1px 5px rgba(0,0,0,0.35);cursor:pointer;
    }
    .s-dot.active{background:#3498db}
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
  </style>
</head>
<body>
<div id="map"></div>
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

  window._tileLayer = L.tileLayer('${tileUrl}',{
    maxZoom:19, subdomains:'abcd'
  }).addTo(map);

  L.control.attribution({position:'bottomright',prefix:''})
    .addAttribution('<span style="font-size:9px">© CartoDB · OpenStreetMap</span>')
    .addTo(map);

  var userMarker = null;
  var followMode = false;
  var stationMarkers = [];
  var activeMarkerId = null;
  var _lastMain = null;
  var _lastPoints = [];
  var _lastExits = [];
  var transportLines = [];
  var transportStops = [];
  // id -> {marker, key} : la vue "arrêts à proximité" se reconstruisait en
  // entier (removeLayer + recréation de tous les divIcon) à chaque zoomend,
  // puis une seconde fois ~600ms plus tard au retour des données fraîches du
  // backend (voir setNearbyStops/_vpTimer) — donc deux reconstructions
  // complètes juste après chaque geste de zoom, pile quand la fluidité
  // compte le plus. "key" résume tout ce qui influence l'icône (modes
  // visibles + échelle) : un arrêt dont l'icône ne change pas entre deux
  // rendus (cas courant : re-zoom léger, ou re-fetch avec les mêmes arrêts)
  // garde son marker existant au lieu d'être supprimé/recréé.
  var nearbyStopMarkerById = {};

  function userIcon(){
    return L.divIcon({
      className:'',
      html:'<div class="u-ring"></div><div class="u-heading"></div><div class="u-dot"></div>',
      iconSize:[16,16], iconAnchor:[8,8]
    });
  }

  function stationIcon(active){
    return L.divIcon({
      className:'',
      html:'<div class="s-dot'+(active?' active':'')+'"></div>',
      iconSize:[11,11], iconAnchor:[5.5,5.5]
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
    map.flyTo(ll,zoom,{animate:true,duration:0.9});
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

  function setStations(stations){
    stationMarkers.forEach(function(m){map.removeLayer(m);});
    stationMarkers=[];
    stations.forEach(function(s){
      if(s.lat==null||s.lon==null) return;
      var active=(s.id===activeMarkerId);
      var m=L.marker([s.lat,s.lon],{icon:stationIcon(active),zIndexOffset:1000})
        .addTo(map)
        .on('click',function(e){
          e.originalEvent.stopPropagation();
          activeMarkerId=s.id;
          stationMarkers.forEach(function(mk,i){
            mk.setIcon(stationIcon(stations[i]&&stations[i].id===s.id));
          });
          window.ReactNativeWebView.postMessage(
            JSON.stringify({type:'stationSelected',id:s.id,label:s.label})
          );
        });
      stationMarkers.push(m);
    });
  }

  function clearActiveStation(){
    activeMarkerId=null;
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
    activeMarkerId=id;
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
    map.flyTo(shifted,zoom,{animate:true,duration:0.9});
  }

  function stopPointIcon(lines){
    var items=(lines&&lines.length?lines:[{code:'?',color:'888888',textColor:'#fff'}]);
    var H=22;
    var badges=items.map(function(l){
      return '<div style="min-width:'+H+'px;height:'+H+'px;background:#'+l.color+';color:'+l.textColor+';'
        +'font-size:11px;font-weight:800;border-radius:5px;padding:0 4px;box-sizing:border-box;'
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
      +'<path d="M20.65,22.97 A11,11 0 1,0 11.35,22.97 L16,32 Z" fill="#0a0082" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>'
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
          +'font-size:11px;font-weight:800;border-radius:5px;padding:0 3px;box-sizing:border-box;'
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
    activeMarkerId=id;
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
      animate:true,duration:0.9,
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

  function setTheme(isDark){
    var url = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    if(window._tileLayer){ map.removeLayer(window._tileLayer); }
    window._tileLayer = L.tileLayer(url,{maxZoom:19,subdomains:'abcd'}).addTo(map);
    document.body.style.background = isDark ? '#031a3a' : '#eef2f7';
    document.getElementById('map').style.background = isDark ? '#031a3a' : '#eef2f7';
    var s = document.getElementById('_gp_dots');
    if(!s){ s=document.createElement('style'); s.id='_gp_dots'; document.head.appendChild(s); }
    s.textContent = isDark
      ? 'img.leaflet-tile{filter:sepia(0.9) hue-rotate(180deg) saturate(2.5) brightness(2.2)!important}'
        + '.s-dot{background:#5ab3f5!important;border-color:rgba(1,14,38,0.8)!important;box-shadow:0 1px 6px rgba(90,179,245,0.4)!important}'
        + '.s-dot.active{background:#fff!important}'
        + '.n-icon{filter:invert(1)!important}'
        + '.n-wrap{background:#010e26!important;border-color:rgba(90,179,245,0.3)!important}'
        + '.sp-badge{background:#010e26!important;border-color:rgba(90,179,245,0.3)!important}'
        + '.map-tail{border-top-color:#010e26!important}'
      : '.n-icon{filter:none!important}'
        + '.n-wrap{background:#ffffff!important;border-color:rgba(0,0,0,0.12)!important}'
        + '.sp-badge{background:#ffffff!important;border-color:rgba(0,0,0,0.12)!important}'
        + '.map-tail{border-top-color:#ffffff!important}';
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

  function _minZoomForStop(s){
    var min=99;
    (s.modes||[]).forEach(function(m){ var z=MODE_MIN_ZOOM[m]||15; if(z<min)min=z; });
    return min;
  }

  function _renderNearbyStops(){
    var z=map.getZoom();
    var seen={};
    _allNearbyStops.forEach(function(s){
      if(s.lat==null||s.lon==null)return;
      if(_hiddenNearbyId!==null&&(s.id===_hiddenNearbyId||s.stop_area_id===_hiddenNearbyId))return;
      if(_minZoomForStop(s)>z)return;
      var isPoint=s.id&&s.id.indexOf('stop_point:')===0;
      var visibleModes=(s.modes||[]).filter(function(m){
        if((MODE_MIN_ZOOM[m]||15)>z)return false;
        if(isPoint) return m==='BUS'||m==='FLUVIAL'||m==='CABLE';
        return m!=='BUS'&&m!=='FLUVIAL';
      });
      if(!visibleModes.length)return;
      var scale=z<12.5?0.62:z<13?0.72:z<13.5?0.80:z<14?0.88:z<15?0.96:z<16?1.05:z<17?1.2:1.4;

      // Tout ce qui suit ne dépend que de "visibleModes" et "scale" — un
      // arrêt dont l'icône serait identique au dernier rendu (id + clé
      // inchangés) garde son marker existant plutôt que d'être détruit et
      // reconstruit (removeLayer + nouveau divIcon HTML), ce qui est le vrai
      // coût de cette fonction, appelée à chaque zoomend.
      var key=visibleModes.join(',')+'|'+scale;
      seen[s.id]=true;
      var existing=nearbyStopMarkerById[s.id];
      if(existing&&existing.key===key) return;
      if(existing) map.removeLayer(existing.marker);

      var maxSz=0;
      visibleModes.forEach(function(m){ var s2=Math.round((MODE_ICON_SIZE[m]||14)*scale); if(s2>maxSz)maxSz=s2; });
      var sz=visibleModes.length>1?Math.max(maxSz-2,12):maxSz;
      var gap=3;
      var totalW=visibleModes.length*sz+(visibleModes.length-1)*gap;
      var imgs=visibleModes.map(function(m){
        var src=NEARBY_ICONS[m]||NEARBY_ICONS['BUS'];
        return '<img class="n-icon" src="'+src+'" style="width:'+sz+'px;height:'+sz+'px"/>';
      }).join('');
      var pad=Math.round(sz*0.18);
      var inner=sz+pad*2; // taille intérieure (sans border)
      var b=2; // 1px border * 2 côtés
      var wrapBr=Math.round((inner+b)*0.22);
      var html,iW,iH;
      if(visibleModes.length===1){
        // Carré parfait : width=height=inner forcés, icône centrée
        html='<div class="n-wrap" style="width:'+inner+'px;height:'+inner+'px;display:flex;align-items:center;justify-content:center;border-radius:'+wrapBr+'px">'+imgs+'</div>';
        iW=inner+b; iH=inner+b;
      } else {
        // Multi-mode : largeur naturelle, hauteur = inner
        var innerW=totalW+pad*2;
        html='<div class="n-wrap" style="width:'+innerW+'px;height:'+inner+'px;display:flex;gap:'+gap+'px;align-items:center;justify-content:center;border-radius:'+wrapBr+'px">'+imgs+'</div>';
        iW=innerW+b; iH=inner+b;
      }
      var icon=L.divIcon({className:'',html:html,iconSize:[iW,iH],iconAnchor:[iW/2,iH/2]});
      var bestZ=0;
      visibleModes.forEach(function(m){var z=MODE_ZINDEX[m]||670;if(z>bestZ)bestZ=z;});
      var m=L.marker([s.lat,s.lon],{icon:icon,zIndexOffset:bestZ})
        .addTo(map)
        .on('click',function(e){
          e.originalEvent.stopPropagation();
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'stationSelected',id:s.stop_area_id||s.id,label:s.label}));
        });
      nearbyStopMarkerById[s.id]={marker:m,key:key};
    });
    // Les arrêts qui n'ont pas été vus cette passe (plus dans la liste, plus
    // dans le champ de vue, ou masqués car station active) perdent leur
    // marker existant.
    Object.keys(nearbyStopMarkerById).forEach(function(id){
      if(!seen[id]){
        map.removeLayer(nearbyStopMarkerById[id].marker);
        delete nearbyStopMarkerById[id];
      }
    });
  }

  function setNearbyStops(stops){
    _allNearbyStops=stops;
    _renderNearbyStops();
  }

  // Anti-rebond : sans lui, chaque zoomend (un par geste de pincement, donc
  // plusieurs si on zoome vite plusieurs fois de suite) relançait aussitôt
  // _renderNearbyStops, qui s'exécute sur le même thread JS que celui qui
  // gère les gestes de la carte — les appels s'empilaient et bloquaient les
  // gestes suivants le temps de les rattraper (le "ça se fige quelques
  // secondes" en zoomant vite plusieurs fois). Ne garder que le dernier
  // zoomend d'une rafale règle ça, sans revenir sur le diff par id déjà en
  // place (qui réduit déjà le coût de chaque appel).
  var _nearbyRenderTimer=null;
  map.on('zoomend',function(){
    clearTimeout(_nearbyRenderTimer);
    _nearbyRenderTimer=setTimeout(_renderNearbyStops,120);
  });
  map.on('click',function(){
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

  function handleMsg(e){
    try{
      var msg=JSON.parse(e.data);
      if(msg.type==='setLocation') setUserLocation(msg.lat,msg.lon);
      if(msg.type==='recenterOnUser') recenterOnUser(msg.lat,msg.lon);
      if(msg.type==='setUserHeading') setUserHeading(msg.deg);
      if(msg.type==='setStations') setStations(msg.stations);
      if(msg.type==='clearActive') clearActiveStation();
      if(msg.type==='setTheme') setTheme(msg.isDark);
      if(msg.type==='flyTo') flyToStation(msg.lat,msg.lon);
      if(msg.type==='showStation') showStation(msg.id,msg.lat,msg.lon);
      if(msg.type==='setTransportData') setTransportData(msg.data);
      if(msg.type==='setNearbyStops') setNearbyStops(msg.stops);
    }catch(err){}
  }
  document.addEventListener('message',handleMsg);
  window.addEventListener('message',handleMsg);
</script>
</body>
</html>`;}

export type NearbyStopMarker = { id: string; stop_area_id: string; label: string; lat: number; lon: number; modes: string[] };

export type MapWebViewRef = {
  setUserLocation: (lat: number, lon: number) => void;
  recenterOnUser: (lat: number, lon: number) => void;
  setUserHeading: (deg: number | null) => void;
  setStations: (stations: Array<{ id: string; label: string; lat?: number; lon?: number }>) => void;
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
    setStations: (stations) => {
      wvRef.current?.injectJavaScript(`setStations(${JSON.stringify(stations)});true;`);
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
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MapWebView;
