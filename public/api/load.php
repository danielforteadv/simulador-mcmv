<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$file = __DIR__ . '/data.json';

if (file_exists($file)) {
    echo file_get_contents($file);
} else {
    echo json_encode(null);
}
