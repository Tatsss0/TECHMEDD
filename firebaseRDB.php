<?php

class firebaseRDB {
   private $url;

   function __construct($url = null) {
      if (isset($url)) {
         $this->url = rtrim($url, '/'); // ensure no trailing slash
      } else {
         throw new Exception("Database URL must be specified");
      }
   }

   private function grab($url, $method, $par = null) {
      $ch = curl_init();
      curl_setopt($ch, CURLOPT_URL, $url);
      curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
      if (isset($par)) {
         curl_setopt($ch, CURLOPT_POSTFIELDS, $par);
      }
      curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
      curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
      curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 1);
      curl_setopt($ch, CURLOPT_TIMEOUT, 120);
      curl_setopt($ch, CURLOPT_HEADER, 0);
      $html = curl_exec($ch);
      curl_close($ch);
      return $html;
   }

   // Realtime Database: INSERT
   public function insert($table, $data) {
      $path = "{$this->url}/$table.json";
      $grab = $this->grab($path, "POST", json_encode($data));
      return $grab;
   }

   // Realtime Database: UPDATE
   public function update($table, $uniqueID, $data) {
      $path = "{$this->url}/$table/$uniqueID.json";
      $grab = $this->grab($path, "PATCH", json_encode($data));
      return $grab;
   }

   // Realtime Database: DELETE
   public function delete($table, $uniqueID) {
      $path = "{$this->url}/$table/$uniqueID.json";
      $grab = $this->grab($path, "DELETE");
      return $grab;
   }

   // Realtime Database: RETRIEVE
   public function retrieve($dbPath, $queryKey = null, $queryType = null, $queryVal = null) {
      if (isset($queryType) && isset($queryKey) && isset($queryVal)) {
         $queryVal = urlencode($queryVal);
         if ($queryType == "EQUAL") {
            $pars = "orderBy=\"$queryKey\"&equalTo=\"$queryVal\"";
         } elseif ($queryType == "LIKE") {
            $pars = "orderBy=\"$queryKey\"&startAt=\"$queryVal\"";
         }
      }
      $pars = isset($pars) ? "?$pars" : "";
      $path = "{$this->url}/$dbPath.json$pars";
      $grab = $this->grab($path, "GET");
      return $grab;
   }

   // Firebase Authentication: SIGN UP (email & password)
   public function signupWithEmailPassword($email, $password, $apiKey) {
      $url = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" . $apiKey;
      $data = json_encode([
         "email" => $email,
         "password" => $password,
         "returnSecureToken" => true
      ]);
      $response = $this->grab($url, "POST", $data);
      return json_decode($response, true); // returns idToken, etc.
   }

   // Firebase Authentication: SIGN IN (email & password)
   public function signInWithEmailPassword($email, $password, $apiKey) {
      $url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" . $apiKey;
      $data = json_encode([
         "email" => $email,
         "password" => $password,
         "returnSecureToken" => true
      ]);
      $response = $this->grab($url, "POST", $data);
      return json_decode($response, true); // returns idToken, etc.
   }
}