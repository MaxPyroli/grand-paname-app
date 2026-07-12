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
  var transportLines = [];
  var transportStops = [];
  var nearbyStopMarkers = [];

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
  }

  function pinIcon(){
    return L.divIcon({
      className:'',
      html:'<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:#FF6B35;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 3px 10px rgba(255,107,53,0.6)"></div>',
      iconSize:[26,26],iconAnchor:[10,22]
    });
  }

  function showStation(id,lat,lon,label){
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
  }

  function flyToStation(lat,lon){
    var zoom=15;
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
      : '.n-icon{filter:none!important}'
        + '.n-wrap{background:#ffffff!important;border-color:rgba(0,0,0,0.12)!important}';
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

  function _minZoomForStop(s){
    var min=99;
    (s.modes||[]).forEach(function(m){ var z=MODE_MIN_ZOOM[m]||15; if(z<min)min=z; });
    return min;
  }

  function _renderNearbyStops(){
    nearbyStopMarkers.forEach(function(m){map.removeLayer(m);});
    nearbyStopMarkers=[];
    var z=map.getZoom();
    _allNearbyStops.forEach(function(s){
      if(s.lat==null||s.lon==null)return;
      if(_minZoomForStop(s)>z)return;
      var isPoint=s.id&&s.id.indexOf('stop_point:')===0;
      var visibleModes=(s.modes||[]).filter(function(m){
        if((MODE_MIN_ZOOM[m]||15)>z)return false;
        if(isPoint) return m==='BUS'||m==='FLUVIAL';
        return m!=='BUS'&&m!=='FLUVIAL';
      });
      if(!visibleModes.length)return;
      var scale=z<12.5?0.62:z<13?0.72:z<13.5?0.80:z<14?0.88:z<15?0.96:z<16?1.05:z<17?1.2:1.4;
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
      nearbyStopMarkers.push(m);
    });
  }

  function setNearbyStops(stops){
    _allNearbyStops=stops;
    _renderNearbyStops();
  }

  map.on('zoomend',function(){ _renderNearbyStops(); });
  map.on('click',function(){
    clearActiveStation();
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'mapTapped'}));
  });

  var _vpTimer=null;
  map.on('moveend zoomend',function(){
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
  setTransportData: (data: { stops: any[]; lines: any[] }) => void;
  setNearbyStops: (stops: NearbyStopMarker[]) => void;
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
