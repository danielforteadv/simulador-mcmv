<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, true);

if ($input) {
    $file = __DIR__ . '/data.json';
    file_put_contents($file, json_encode($input));
    @chmod($file, 0666);
    echo json_encode(["status" => "success", "message" => "Data saved successfully"]);
} else {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Invalid JSON"]);
}
